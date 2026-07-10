import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PropertyChangeType } from "@/lib/supabase/types";

export const PAGE_SIZE = 50;
const PROPERTIES_FETCH_PAGE_SIZE = 1000;

// Categorias de FILTRO (3-way, decisão confirmada com o usuário) — não o
// mesmo conjunto de valores de `change_type` no banco (4 valores: price/
// added/removed/reappeared). "disponibilidade" aqui continua agrupando
// removed+reappeared, como já era — são duas faces do mesmo evento
// (disponibilidade de um imóvel já conhecido oscilando), e quem filtra
// "Disponibilidade" normalmente quer ver os dois juntos. "Adicionado" é
// conceitualmente diferente (inventário novo, não mudança de estado de algo
// já conhecido) e não participa de direction/minVariation (que só fazem
// sentido comparando old_price/new_price de um imóvel já conhecido) — por
// isso ganhou o próprio filtro em vez de virar "disponibilidade" também. A
// tabela (report-table.tsx) continua distinguindo removed de reappeared
// visualmente, só não como filtro separado.
export type ChangeType = "preco" | "adicionado" | "disponibilidade";
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
  changeType: PropertyChangeType;
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
// coluna-vs-valor. E filtrar property_changes por `.in("property_id", ...)`
// quebra em contas com um concorrente grande (json_api, centenas/milhares
// de imóveis — reproduzido com Sentineli & Sobral, 1000 properties: a URL
// fica gigante e o Supabase rejeita com 400 antes de processar). Por isso
// a estratégia é sempre a mesma agora, não só quando direction/minVariation
// estão ativos: busca property_changes filtrado só por data/tipo (colunas
// simples, sem problema de escala; RLS já escopa por conta sozinha) e faz
// a interseção com o conjunto de imóveis filtrado (status/busca/concorrente)
// em JS, via Set — nunca manda uma lista de IDs na URL. Paginação também
// vira sempre em JS (.slice), não mais .range()+count do Postgres — na
// escala esperada ("centenas de linhas" de property_changes por conta, por
// semanas — não confundir com a quantidade de properties, que é o que
// estava estourando) isso é trivial.
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

  // Paginado explicitamente — o PostgREST devolve no máximo ~1000 linhas
  // por resposta por padrão, silenciosamente. Um .select() sem paginação
  // não "busca tudo" a partir de mil linhas (reproduzido contra dados
  // reais: Sentineli & Sobral tem 1408 properties, essa query devolvia só
  // 1000, derrubando linhas do relatório sem nenhum aviso — mesma causa
  // raiz do bug de duplicate key corrigido em persist-and-compare.ts). Cada
  // página reconstrói a query do zero (mesmos filtros + .range() novo) —
  // um query builder do supabase-js só pode ser resolvido (`await`) uma
  // vez, não dá pra reaproveitar o mesmo objeto entre páginas.
  function buildPropertiesQuery(offset: number) {
    let q = supabase.from("properties").select("id, external_id, competitor_id, status").in("competitor_id", targetCompetitorIds);
    if (filters.status !== "ambos") q = q.eq("status", filters.status);
    if (filters.search) q = q.ilike("external_id", `%${filters.search}%`);
    return q.range(offset, offset + PROPERTIES_FETCH_PAGE_SIZE - 1);
  }

  const properties: { id: string; external_id: string; competitor_id: string; status: string }[] = [];
  for (let offset = 0; ; offset += PROPERTIES_FETCH_PAGE_SIZE) {
    const { data, error: propertiesError } = await buildPropertiesQuery(offset);
    if (propertiesError) throw new Error(`Falha ao buscar imóveis: ${propertiesError.message}`);
    properties.push(...(data ?? []));
    if (!data || data.length < PROPERTIES_FETCH_PAGE_SIZE) break;
  }

  const propertyById = new Map(properties.map((p) => [p.id, p]));
  const propertyIds = new Set(properties.map((p) => p.id));

  if (propertyIds.size === 0) {
    return { rows: [], totalCount: 0, competitors: allCompetitors ?? [] };
  }

  // Sem .in("property_id", ...) — ver comentário grande acima da função.
  // Filtros de coluna simples só (data, change_type); RLS restringe à conta.
  let changesQuery = supabase
    .from("property_changes")
    .select("id, property_id, change_type, old_price, new_price, old_status, new_status, detected_at");

  if (filters.from) changesQuery = changesQuery.gte("detected_at", `${filters.from}T00:00:00.000Z`);
  if (filters.to) changesQuery = changesQuery.lte("detected_at", `${filters.to}T23:59:59.999Z`);

  // Categoria de filtro -> change_type real no banco (ver comentário no
  // type ChangeType acima). Só filtra na query quando a seleção é um
  // SUBCONJUNTO das 3 categorias — com as 3 marcadas, equivale a "sem
  // filtro", igual já era antes.
  const wantedChangeTypes: PropertyChangeType[] = [];
  if (filters.types.includes("preco")) wantedChangeTypes.push("price");
  if (filters.types.includes("adicionado")) wantedChangeTypes.push("added");
  if (filters.types.includes("disponibilidade")) wantedChangeTypes.push("removed", "reappeared");
  if (wantedChangeTypes.length > 0 && wantedChangeTypes.length < 4) {
    changesQuery = changesQuery.in("change_type", wantedChangeTypes);
  }

  changesQuery = changesQuery.order("detected_at", { ascending: filters.sort === "asc" });

  const { data: changes, error: changesError } = await changesQuery;
  if (changesError) throw new Error(`Falha ao buscar mudanças: ${changesError.message}`);

  function toRow(change: NonNullable<typeof changes>[number]): ReportRow | null {
    // Interseção com o conjunto de imóveis filtrado (concorrente/status/
    // busca) — é aqui, em JS, que esse filtro acontece agora, não mais
    // numa cláusula .in() na query.
    if (!propertyIds.has(change.property_id)) return null;
    const property = propertyById.get(change.property_id);
    if (!property) return null;
    const meta = competitorMeta.get(property.competitor_id);
    return {
      id: change.id,
      competitorId: property.competitor_id,
      competitorName: meta?.name ?? "Concorrente removido",
      competitorAbbreviation: meta?.abbreviation ?? "???",
      externalId: property.external_id,
      changeType: change.change_type,
      oldPrice: change.old_price,
      newPrice: change.new_price,
      oldStatus: change.old_status,
      newStatus: change.new_status,
      detectedAt: change.detected_at,
    };
  }

  const candidateRows = (changes ?? []).map(toRow).filter((r): r is ReportRow => r !== null);

  const needsDirectionFiltering = filters.direction !== "ambos" || filters.minVariation !== null;
  const filtered = !needsDirectionFiltering
    ? candidateRows
    : candidateRows.filter((row) => {
        // direction/minVariation só valem pra mudança de preço —
        // adicionado/disponibilidade ficam excluídos automaticamente,
        // avisado na UI.
        if (row.changeType !== "price" || row.oldPrice === null || row.newPrice === null) return false;

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
