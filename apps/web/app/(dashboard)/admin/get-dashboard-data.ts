import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PropertyChangeType } from "@/lib/supabase/types";
import type { PropertyAttributes } from "@/app/(dashboard)/property-reference-link";

export interface FeedItem {
  id: string;
  competitorId: string;
  competitorName: string;
  competitorAbbreviation: string;
  referenceCode: string | null;
  url: string;
  status: "ativo" | "possivelmente_vendido";
  attributes: PropertyAttributes | null;
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

export interface HourlyVolume {
  hour: number; // 0-23, UTC
  count: number;
}

export interface VolatileProperty {
  competitorId: string;
  abbreviation: string;
  referenceCode: string | null;
  url: string;
  status: "ativo" | "possivelmente_vendido";
  attributes: PropertyAttributes | null;
  count: number;
}

export interface DashboardData {
  hasCompetitors: boolean;
  activeCompetitorsCount: number;
  changes1h: number;
  changes24h: number;
  // Janela de 24-48h atrás — mesmo tamanho de changes24h, imediatamente
  // anterior. Só existe pra alimentar o indicador percentual da KpiCard
  // (ver kpi-card.tsx); não é exibido em lugar nenhum sozinho.
  changesPrevious24h: number;
  changes7d: number;
  feed: FeedItem[];
  dailyVolumes: DailyVolume[];
  breakdownByWindow: {
    "24h": CompetitorBreakdownEntry[];
    "7d": CompetitorBreakdownEntry[];
    "30d": CompetitorBreakdownEntry[];
  };
  hourlyVolumes30d: HourlyVolume[];
  topVolatileProperties30d: VolatileProperty[];
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const FETCH_PAGE_SIZE = 1000;
const TOP_VOLATILE_LIMIT = 5; // top 5 — cabe compacto na coluna de gráficos ao lado do feed

interface PropertyRef {
  id: string;
  external_id: string;
  reference_code: string | null;
  url: string;
  status: "ativo" | "possivelmente_vendido";
  attributes: PropertyAttributes | null;
  competitor_id: string;
}

interface ChangeRecord {
  id: string;
  property_id: string;
  change_type: PropertyChangeType;
  old_price: number | null;
  new_price: number | null;
  old_status: string | null;
  new_status: string | null;
  detected_at: string;
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
      .select("id, external_id, reference_code, url, status, attributes, competitor_id")
      .in("competitor_id", competitorIds)
      .range(offset, offset + FETCH_PAGE_SIZE - 1);
    if (error) throw new Error(`Falha ao buscar imóveis: ${error.message}`);
    all.push(...(data ?? []));
    if (!data || data.length < FETCH_PAGE_SIZE) break;
    offset += FETCH_PAGE_SIZE;
  }
  return all;
}

// Mesmo raciocínio de fetchAllProperties acima — uma janela de 30 dias de
// property_changes pode facilmente passar de 1000 linhas numa conta com
// vários concorrentes ativos, e sem paginação explícita o PostgREST corta
// silenciosamente, subcontando mudanças no feed/indicadores do painel.
async function fetchAllChanges(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sinceIso: string
): Promise<ChangeRecord[]> {
  const all: ChangeRecord[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("property_changes")
      .select("id, property_id, change_type, old_price, new_price, old_status, new_status, detected_at")
      .gte("detected_at", sinceIso)
      .order("detected_at", { ascending: false })
      .range(offset, offset + FETCH_PAGE_SIZE - 1);
    if (error) throw new Error(`Falha ao buscar mudanças: ${error.message}`);
    all.push(...(data ?? []));
    if (!data || data.length < FETCH_PAGE_SIZE) break;
    offset += FETCH_PAGE_SIZE;
  }
  return all;
}

const EMPTY_DASHBOARD_DATA: Omit<DashboardData, "hasCompetitors" | "activeCompetitorsCount" | "dailyVolumes"> = {
  changes1h: 0,
  changes24h: 0,
  changesPrevious24h: 0,
  changes7d: 0,
  feed: [],
  breakdownByWindow: { "24h": [], "7d": [], "30d": [] },
  hourlyVolumes30d: Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 })),
  topVolatileProperties30d: [],
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
  // Janela ampliada pra 30 dias (era 7) — os dois gráficos novos do painel
  // ("Horários com mais alterações" e "Imóveis mais voláteis", movidos de
  // Relatórios a pedido do usuário) precisam de uma amostra maior que 7 dias
  // pra fazer sentido. changes1h/24h/7d e o feed continuam corretos: o
  // filtro por idade (isWithin7d etc.) agora é explícito no loop abaixo, em
  // vez de depender do fetch já vir pré-recortado em 7 dias.
  const sinceIso = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
  const changes = await fetchAllChanges(supabase, sinceIso);

  const now = Date.now();
  let changes1h = 0;
  let changes24h = 0;
  let changesPrevious24h = 0;
  let changes7d = 0;
  const dailyCounts = new Map<string, number>();
  const hourlyCounts = new Map<number, number>();
  const volatilityCounts = new Map<string, VolatileProperty>();
  const feed: FeedItem[] = [];

  // Contagem por concorrente nas 3 janelas do seletor do gráfico de pizza
  // (24h/7d/30d) — acumulada num Map por competitorId, uma passada só pelos
  // changes (já filtrados pra 30d, a janela mais larga buscada; 24h/7d são
  // subconjuntos filtrados por idade dentro do próprio loop; 30d é sempre
  // todo mundo, já que o fetch inteiro já é essa janela).
  const countsByWindow = {
    "24h": new Map<string, number>(),
    "7d": new Map<string, number>(),
    "30d": new Map<string, number>(),
  };

  for (const change of changes) {
    const detectedAtMs = new Date(change.detected_at).getTime();
    const ageMs = now - detectedAtMs;
    const isWithin1h = ageMs <= ONE_HOUR_MS;
    const isWithin24h = ageMs <= ONE_DAY_MS;
    const isWithinPrevious24h = ageMs > ONE_DAY_MS && ageMs <= ONE_DAY_MS * 2;
    const isWithin7d = ageMs <= SEVEN_DAYS_MS;
    if (isWithin1h) changes1h++;
    if (isWithin24h) changes24h++;
    if (isWithinPrevious24h) changesPrevious24h++;
    if (isWithin7d) changes7d++;

    const dayKey = change.detected_at.slice(0, 10);
    dailyCounts.set(dayKey, (dailyCounts.get(dayKey) ?? 0) + 1);

    const hourKey = new Date(change.detected_at).getUTCHours();
    hourlyCounts.set(hourKey, (hourlyCounts.get(hourKey) ?? 0) + 1);

    const property = propertyById.get(change.property_id);
    if (property) {
      const competitorId = property.competitor_id;
      // 30d sempre conta — o fetch inteiro já é essa janela (sinceIso).
      countsByWindow["30d"].set(competitorId, (countsByWindow["30d"].get(competitorId) ?? 0) + 1);
      if (isWithin7d) countsByWindow["7d"].set(competitorId, (countsByWindow["7d"].get(competitorId) ?? 0) + 1);
      if (isWithin24h) countsByWindow["24h"].set(competitorId, (countsByWindow["24h"].get(competitorId) ?? 0) + 1);

      // Agrupamento continua por external_id (chave técnica estável) — só o
      // que é exibido no resultado (referenceCode/url) muda pro campo de
      // exibição.
      const volatilityKey = `${competitorId}:${property.external_id}`;
      const volatilityEntry = volatilityCounts.get(volatilityKey);
      if (volatilityEntry) volatilityEntry.count++;
      else
        volatilityCounts.set(volatilityKey, {
          competitorId,
          abbreviation: competitorMeta.get(competitorId)?.abbreviation ?? "???",
          referenceCode: property.reference_code,
          url: property.url,
          status: property.status,
          attributes: property.attributes,
          count: 1,
        });

      if (feed.length < 15) {
        feed.push({
          id: change.id,
          competitorId,
          competitorName: competitorMeta.get(competitorId)?.name ?? "Concorrente removido",
          competitorAbbreviation: competitorMeta.get(competitorId)?.abbreviation ?? "???",
          referenceCode: property.reference_code,
          url: property.url,
          status: property.status,
          attributes: property.attributes,
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

  const hourlyVolumes30d: HourlyVolume[] = Array.from({ length: 24 }, (_, hour) => ({ hour, count: hourlyCounts.get(hour) ?? 0 }));
  const topVolatileProperties30d = [...volatilityCounts.values()].sort((a, b) => b.count - a.count).slice(0, TOP_VOLATILE_LIMIT);

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
    changesPrevious24h,
    changes7d,
    feed,
    dailyVolumes,
    breakdownByWindow: {
      "24h": buildBreakdown(countsByWindow["24h"]),
      "7d": buildBreakdown(countsByWindow["7d"]),
      "30d": buildBreakdown(countsByWindow["30d"]),
    },
    hourlyVolumes30d,
    topVolatileProperties30d,
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
