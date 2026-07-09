import "server-only";
import { createClient } from "@/lib/supabase/server";

export const PAGE_SIZE = 50;

export type ChangeType = "preco" | "disponibilidade";
export type Direction = "aumento" | "reducao" | "ambos";
export type PropertyStatusFilter = "ativo" | "possivelmente_vendido" | "ambos";

export interface ReportFilters {
  competitorIds: string[] | null; // null = todos os concorrentes da conta
  from: string | null; // YYYY-MM-DD, null = sem limite inferior
  to: string | null; // YYYY-MM-DD, null = sem limite superior
  types: ChangeType[]; // nunca vazio — page.tsx garante pelo menos 1
  direction: Direction;
  minVariation: { value: number; unit: "reais" | "percent" } | null;
  status: PropertyStatusFilter;
  search: string | null;
  sort: "asc" | "desc";
  page: number;
}

export interface ReportRow {
  id: string;
  competitorId: string;
  competitorName: string;
  competitorAbbreviation: string;
  externalId: string;
  type: ChangeType;
  oldPrice: number | null;
  newPrice: number | null;
  oldStatus: string | null;
  newStatus: string | null;
  detectedAt: string;
}

export interface ReportResult {
  rows: ReportRow[];
  totalCount: number;
  competitors: { id: string; name: string; abbreviation: string }[];
}

// direction/minVariation comparam old_price com new_price — o
// query-builder do PostgREST não faz filtro coluna-vs-coluna, só
// coluna-vs-valor. Nos únicos dois filtros que precisam disso, busca-se o
// conjunto candidato inteiro (já filtrado por data/tipo/status/busca no
// banco) e filtra/pagina em JS. Na escala esperada ("centenas de linhas"
// por conta, por semanas) isso é trivial — não justifica uma RPC/view só
// pra isso agora. Sem esses dois filtros, pagina direto no banco
// (.range + count exact), que é o caminho mais comum.
export async function getReportData(accountId: string, filters: ReportFilters): Promise<ReportResult> {
  const supabase = await createClient();

  const { data: allCompetitors, error: competitorsError } = await supabase
    .from("competitors")
    .select("id, name, abbreviation")
    .eq("account_id", accountId)
    .order("name");
  if (competitorsError) throw new Error(`Falha ao buscar concorrentes: ${competitorsError.message}`);

  const accountCompetitorIds = new Set((allCompetitors ?? []).map((c) => c.id));
  // Nunca confia em IDs vindos da URL sem checar que pertencem à conta —
  // interseção com os concorrentes reais da conta, não um .in() direto.
  const targetCompetitorIds = filters.competitorIds
    ? filters.competitorIds.filter((id) => accountCompetitorIds.has(id))
    : [...accountCompetitorIds];

  if (targetCompetitorIds.length === 0) {
    return { rows: [], totalCount: 0, competitors: allCompetitors ?? [] };
  }

  const competitorMeta = new Map((allCompetitors ?? []).map((c) => [c.id, { name: c.name, abbreviation: c.abbreviation }]));

  let propertiesQuery = supabase
    .from("properties")
    .select("id, external_id, competitor_id, status")
    .in("competitor_id", targetCompetitorIds);

  if (filters.status !== "ambos") {
    propertiesQuery = propertiesQuery.eq("status", filters.status);
  }
  if (filters.search) {
    propertiesQuery = propertiesQuery.ilike("external_id", `%${filters.search}%`);
  }

  const { data: properties, error: propertiesError } = await propertiesQuery;
  if (propertiesError) throw new Error(`Falha ao buscar imóveis: ${propertiesError.message}`);

  const propertyById = new Map((properties ?? []).map((p) => [p.id, p]));
  const propertyIds = (properties ?? []).map((p) => p.id);

  if (propertyIds.length === 0) {
    return { rows: [], totalCount: 0, competitors: allCompetitors ?? [] };
  }

  const needsJsFiltering = filters.direction !== "ambos" || filters.minVariation !== null;

  let changesQuery = supabase
    .from("property_changes")
    .select("id, property_id, old_price, new_price, old_status, new_status, detected_at", needsJsFiltering ? {} : { count: "exact" })
    .in("property_id", propertyIds);

  if (filters.from) changesQuery = changesQuery.gte("detected_at", `${filters.from}T00:00:00.000Z`);
  if (filters.to) changesQuery = changesQuery.lte("detected_at", `${filters.to}T23:59:59.999Z`);

  // Tipo: "preço" = old_status/new_status nulos (ver persist-and-compare.ts);
  // "disponibilidade" = new_status preenchido.
  const wantsPrice = filters.types.includes("preco");
  const wantsAvailability = filters.types.includes("disponibilidade");
  if (wantsPrice && !wantsAvailability) {
    changesQuery = changesQuery.is("new_status", null);
  } else if (wantsAvailability && !wantsPrice) {
    changesQuery = changesQuery.not("new_status", "is", null);
  }

  changesQuery = changesQuery.order("detected_at", { ascending: filters.sort === "asc" });

  if (!needsJsFiltering) {
    const offset = (filters.page - 1) * PAGE_SIZE;
    changesQuery = changesQuery.range(offset, offset + PAGE_SIZE - 1);
  }

  const { data: changes, error: changesError, count } = await changesQuery;
  if (changesError) throw new Error(`Falha ao buscar mudanças: ${changesError.message}`);

  function toRow(change: NonNullable<typeof changes>[number]): ReportRow | null {
    const property = propertyById.get(change.property_id);
    if (!property) return null;
    const meta = competitorMeta.get(property.competitor_id);
    return {
      id: change.id,
      competitorId: property.competitor_id,
      competitorName: meta?.name ?? "Concorrente removido",
      competitorAbbreviation: meta?.abbreviation ?? "???",
      externalId: property.external_id,
      type: change.new_status !== null ? "disponibilidade" : "preco",
      oldPrice: change.old_price,
      newPrice: change.new_price,
      oldStatus: change.old_status,
      newStatus: change.new_status,
      detectedAt: change.detected_at,
    };
  }

  if (!needsJsFiltering) {
    const rows = (changes ?? []).map(toRow).filter((r): r is ReportRow => r !== null);
    return { rows, totalCount: count ?? 0, competitors: allCompetitors ?? [] };
  }

  // Caminho com direction/minVariation: filtra em JS (só se aplica a
  // mudanças de preço — disponibilidade fica excluída automaticamente,
  // avisado na UI do formulário) e pagina depois de filtrar.
  const allRows = (changes ?? []).map(toRow).filter((r): r is ReportRow => r !== null);

  const filtered = allRows.filter((row) => {
    if (row.type !== "preco" || row.oldPrice === null || row.newPrice === null) return false;

    if (filters.direction === "aumento" && row.newPrice <= row.oldPrice) return false;
    if (filters.direction === "reducao" && row.newPrice >= row.oldPrice) return false;

    if (filters.minVariation) {
      const delta = Math.abs(row.newPrice - row.oldPrice);
      if (filters.minVariation.unit === "reais") {
        if (delta < filters.minVariation.value) return false;
      } else {
        const pct = row.oldPrice === 0 ? 0 : (delta / row.oldPrice) * 100;
        if (pct < filters.minVariation.value) return false;
      }
    }
    return true;
  });

  const totalCount = filtered.length;
  const offset = (filters.page - 1) * PAGE_SIZE;
  const rows = filtered.slice(offset, offset + PAGE_SIZE);

  return { rows, totalCount, competitors: allCompetitors ?? [] };
}
