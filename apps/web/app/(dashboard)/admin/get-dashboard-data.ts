import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PropertyChangeType } from "@/lib/supabase/types";

export interface FeedItem {
  id: string;
  competitorName: string;
  externalId: string;
  changeType: PropertyChangeType;
  oldPrice: number | null;
  newPrice: number | null;
  oldStatus: string | null;
  newStatus: string | null;
  detectedAt: string;
}

export interface DailyVolume {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface CompetitorBreakdownEntry {
  competitorId: string;
  name: string;
  abbreviation: string;
  count: number;
}

export interface DashboardData {
  hasCompetitors: boolean;
  activeCompetitorsCount: number;
  changes1h: number;
  changes24h: number;
  changes7d: number;
  feed: FeedItem[];
  dailyVolumes: DailyVolume[];
  breakdownByWindow: {
    "1h": CompetitorBreakdownEntry[];
    "24h": CompetitorBreakdownEntry[];
    "7d": CompetitorBreakdownEntry[];
  };
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const FETCH_PAGE_SIZE = 1000;

interface PropertyRef {
  id: string;
  external_id: string;
  competitor_id: string;
}

// O PostgREST devolve no máximo ~1000 linhas por resposta por padrão,
// silenciosamente (sem erro) — um .select() sem paginação explícita não
// "busca tudo" a partir de mil linhas. Reproduzido contra dados reais
// (Sentineli & Sobral, 1408 properties): essa query devolvia só 1000,
// derrubando ~408 imóveis do feed/breakdown sem nenhum aviso (mesma causa
// raiz do bug de duplicate key corrigido em persist-and-compare.ts).
async function fetchAllProperties(
  supabase: Awaited<ReturnType<typeof createClient>>,
  competitorIds: string[]
): Promise<PropertyRef[]> {
  const all: PropertyRef[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("properties")
      .select("id, external_id, competitor_id")
      .in("competitor_id", competitorIds)
      .range(offset, offset + FETCH_PAGE_SIZE - 1);
    if (error) throw new Error(`Falha ao buscar imóveis: ${error.message}`);
    all.push(...(data ?? []));
    if (!data || data.length < FETCH_PAGE_SIZE) break;
    offset += FETCH_PAGE_SIZE;
  }
  return all;
}

const EMPTY_DASHBOARD_DATA: Omit<DashboardData, "hasCompetitors" | "activeCompetitorsCount" | "dailyVolumes"> = {
  changes1h: 0,
  changes24h: 0,
  changes7d: 0,
  feed: [],
  breakdownByWindow: { "1h": [], "24h": [], "7d": [] },
};

// Busca sequencial simples (não embed aninhado do PostgREST) e junta em JS —
// o Database type deste projeto é escrito à mão sem metadados de
// relacionamento completos (ver apps/web/lib/supabase/types.ts), então
// embeds tipados não são confiáveis aqui. Volume de dados é pequeno o
// suficiente (escala de demonstração) pra isso não ser um problema de
// performance real.
export async function getDashboardData(accountId: string): Promise<DashboardData> {
  const supabase = await createClient();

  const { data: competitors, error: competitorsError } = await supabase
    .from("competitors")
    .select("id, name, abbreviation, status")
    .eq("account_id", accountId);
  if (competitorsError) throw new Error(`Falha ao buscar concorrentes: ${competitorsError.message}`);

  const activeCompetitorsCount = (competitors ?? []).filter((c) => c.status === "ativo").length;
  const hasCompetitors = (competitors ?? []).length > 0;
  const emptyDailyVolumes = buildEmptyDailyVolumes();

  if (!hasCompetitors) {
    return { hasCompetitors: false, activeCompetitorsCount: 0, dailyVolumes: emptyDailyVolumes, ...EMPTY_DASHBOARD_DATA };
  }

  const competitorMeta = new Map((competitors ?? []).map((c) => [c.id, { name: c.name, abbreviation: c.abbreviation }]));
  const competitorIds = (competitors ?? []).map((c) => c.id);

  const properties = await fetchAllProperties(supabase, competitorIds);

  const propertyById = new Map(properties.map((p) => [p.id, p]));
  const propertyIds = properties.map((p) => p.id);

  if (propertyIds.length === 0) {
    return { hasCompetitors: true, activeCompetitorsCount, dailyVolumes: emptyDailyVolumes, ...EMPTY_DASHBOARD_DATA };
  }

  // Sem .in("property_id", propertyIds) de propósito — com um concorrente
  // grande (json_api, centenas/milhares de imóveis), essa lista vira uma
  // URL gigante e o Supabase rejeita com 400 antes de processar (bug real,
  // reproduzido com Sentineli & Sobral, 1000 properties). A policy RLS
  // "account_members_select" em property_changes já escopa por conta via
  // property_id → properties → competitors → account_id no próprio banco
  // (ver supabase/migrations/0001_init.sql) — reimplementar esse filtro no
  // cliente era redundante E foi exatamente a redundância que quebrou.
  const sinceIso = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
  const { data: changes, error: changesError } = await supabase
    .from("property_changes")
    .select("id, property_id, change_type, old_price, new_price, old_status, new_status, detected_at")
    .gte("detected_at", sinceIso)
    .order("detected_at", { ascending: false });
  if (changesError) throw new Error(`Falha ao buscar mudanças: ${changesError.message}`);

  const now = Date.now();
  let changes1h = 0;
  let changes24h = 0;
  const dailyCounts = new Map<string, number>();
  const feed: FeedItem[] = [];

  // Contagem por concorrente nas 3 janelas — acumulada num Map por
  // competitorId, uma passada só pelos changes (já filtrados pra 7d, que é
  // a janela mais larga; 1h/24h são subconjuntos do mesmo resultado).
  const countsByWindow = {
    "1h": new Map<string, number>(),
    "24h": new Map<string, number>(),
    "7d": new Map<string, number>(),
  };

  for (const change of changes ?? []) {
    const detectedAtMs = new Date(change.detected_at).getTime();
    const ageMs = now - detectedAtMs;
    const isWithin1h = ageMs <= ONE_HOUR_MS;
    const isWithin24h = ageMs <= ONE_DAY_MS;
    if (isWithin1h) changes1h++;
    if (isWithin24h) changes24h++;

    const dayKey = change.detected_at.slice(0, 10);
    dailyCounts.set(dayKey, (dailyCounts.get(dayKey) ?? 0) + 1);

    const property = propertyById.get(change.property_id);
    if (property) {
      const competitorId = property.competitor_id;
      countsByWindow["7d"].set(competitorId, (countsByWindow["7d"].get(competitorId) ?? 0) + 1);
      if (isWithin24h) countsByWindow["24h"].set(competitorId, (countsByWindow["24h"].get(competitorId) ?? 0) + 1);
      if (isWithin1h) countsByWindow["1h"].set(competitorId, (countsByWindow["1h"].get(competitorId) ?? 0) + 1);

      if (feed.length < 15) {
        feed.push({
          id: change.id,
          competitorName: competitorMeta.get(competitorId)?.name ?? "Concorrente removido",
          externalId: property.external_id,
          changeType: change.change_type,
          oldPrice: change.old_price,
          newPrice: change.new_price,
          oldStatus: change.old_status,
          newStatus: change.new_status,
          detectedAt: change.detected_at,
        });
      }
    }
  }

  function buildBreakdown(counts: Map<string, number>): CompetitorBreakdownEntry[] {
    return [...counts.entries()]
      .map(([competitorId, count]) => ({
        competitorId,
        name: competitorMeta.get(competitorId)?.name ?? "Concorrente removido",
        abbreviation: competitorMeta.get(competitorId)?.abbreviation ?? "???",
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }

  const dailyVolumes = emptyDailyVolumes.map((bucket) => ({
    date: bucket.date,
    count: dailyCounts.get(bucket.date) ?? 0,
  }));

  return {
    hasCompetitors: true,
    activeCompetitorsCount,
    changes1h,
    changes24h,
    changes7d: (changes ?? []).length,
    feed,
    dailyVolumes,
    breakdownByWindow: {
      "1h": buildBreakdown(countsByWindow["1h"]),
      "24h": buildBreakdown(countsByWindow["24h"]),
      "7d": buildBreakdown(countsByWindow["7d"]),
    },
  };
}

// Gera os 7 dias mais recentes (incluindo hoje) como buckets com count 0 —
// garante que o gráfico sempre tenha 7 barras, mesmo em dias sem nenhuma
// mudança. Bucket por dia UTC (simplificação deliberada — não é
// timezone-aware por usuário; aceitável na escala/estágio atual do produto).
function buildEmptyDailyVolumes(): DailyVolume[] {
  const days: DailyVolume[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    days.push({ date: d.toISOString().slice(0, 10), count: 0 });
  }
  return days;
}
