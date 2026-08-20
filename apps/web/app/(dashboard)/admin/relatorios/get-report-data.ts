import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PropertyChangeType } from "@/lib/supabase/types";
import type { PropertyAttributes } from "@/app/(dashboard)/property-reference-link";

export const PAGE_SIZE = 50;
const PROPERTIES_FETCH_PAGE_SIZE = 1000;
const CHANGES_FETCH_PAGE_SIZE = 1000;

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
  // Chave técnica estável do imóvel (properties.id) — só pra deduplicar
  // "imóveis únicos alterados" no indicador abaixo, nunca exibida.
  propertyId: string;
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

export interface ReportIndicators {
  totalChanges: number;
  uniquePropertiesChanged: number;
  byCompetitor: { competitorId: string; name: string; abbreviation: string; count: number }[];
  // Contagens do período anterior (mesmo tamanho, mesmos filtros) — só
  // quando from/to estão os dois definidos (ver computeComparisonWindow).
  // null = sem período anterior bem definido; o indicador percentual do
  // KpiCard não aparece nesse caso (decisão confirmada com o usuário).
  previousPeriod: { totalChanges: number; uniquePropertiesChanged: number } | null;
}

export interface ReportResult {
  rows: ReportRow[];
  totalCount: number;
  competitors: { id: string; name: string; abbreviation: string }[];
  indicators: ReportIndicators;
}

const EMPTY_INDICATORS: ReportIndicators = {
  totalChanges: 0,
  uniquePropertiesChanged: 0,
  byCompetitor: [],
  previousPeriod: null,
};

// Calculado sobre TODAS as linhas filtradas (antes da paginação) — os
// indicadores respondem à mesma pergunta que a tabela abaixo deles, só que
// agregada, não uma amostra da página atual. Os outros indicadores que
// existiam aqui (por dia, por hora, imóveis voláteis, direção por
// concorrente) foram removidos/movidos — ver report-charts.tsx.
// previousPeriod fica de fora daqui de propósito (Omit) — quem chama monta
// esse campo separado, só quando from/to permitem uma janela de comparação.
function computeIndicators(filtered: ReportRow[]): Omit<ReportIndicators, "previousPeriod"> {
  const uniqueProperties = new Set(filtered.map((r) => r.propertyId));

  const byCompetitorMap = new Map<string, { name: string; abbreviation: string; count: number }>();
  for (const row of filtered) {
    const competitorEntry = byCompetitorMap.get(row.competitorId);
    if (competitorEntry) competitorEntry.count++;
    else byCompetitorMap.set(row.competitorId, { name: row.competitorName, abbreviation: row.competitorAbbreviation, count: 1 });
  }

  return {
    totalChanges: filtered.length,
    uniquePropertiesChanged: uniqueProperties.size,
    byCompetitor: [...byCompetitorMap.entries()]
      .map(([competitorId, v]) => ({ competitorId, ...v }))
      .sort((a, b) => b.count - a.count),
  };
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
    return { rows: [], totalCount: 0, competitors: allCompetitors ?? [], indicators: EMPTY_INDICATORS };
  }

  const competitorMeta = new Map((allCompetitors ?? []).map((c) => [c.id, { name: c.name, abbreviation: c.abbreviation }]));

  // Paginado explicitamente — o PostgREST devolve no máximo ~1000 linhas
  // por resposta por padrão, silenciosamente. Um .select() sem paginação
  // não "busca tudo" a partir de mil linhas (reproduzido contra dados
  // reais: Sentineli & Sobral tem 1408 properties, essa query devolvia só
  // 1000, derrubando linhas do relatório sem nenhum aviso — mesma causa
  // raiz do bug de duplicate key corrigido em persist-and-compare.ts).
  //
  // Cursor por "id" (keyset), não .range(offset, ...) — medido contra dados
  // reais (conta com 5467 properties, RLS ativa via chave anon): OFFSET alto
  // sob RLS é imprevisível (páginas em offset 3000/4000 chegaram a 2-2.4s
  // cada, Postgres reavalia a policy pra cada linha varrida até alcançar o
  // offset, não só pra cada linha devolvida), enquanto cursor por id ficou
  // consistente (~130-160ms por página, sem crescer com o offset) — total
  // 5.4s → ~0.8s. Seguro aqui porque a ORDEM de properties nunca aparece pro
  // usuário: essa lista só vira os Maps/Set abaixo (propertyById/
  // propertyIds), usados pra enriquecer e filtrar as linhas de
  // property_changes — quem decide a ordem final exibida é o ORDER BY
  // detected_at em fetchFilteredRows, não este fetch.
  function buildPropertiesQuery(cursor: string | null) {
    let q = supabase
      .from("properties")
      .select("id, external_id, reference_code, url, attributes, competitor_id, status")
      .in("competitor_id", targetCompetitorIds);
    if (filters.status !== "ambos") q = q.eq("status", filters.status);
    if (filters.search) q = q.ilike("external_id", `%${filters.search}%`);
    if (cursor) q = q.gt("id", cursor);
    return q.order("id", { ascending: true }).limit(PROPERTIES_FETCH_PAGE_SIZE);
  }

  const properties: {
    id: string;
    external_id: string;
    reference_code: string | null;
    url: string;
    attributes: PropertyAttributes | null;
    competitor_id: string;
    status: "ativo" | "possivelmente_vendido";
  }[] = [];
  let propertiesCursor: string | null = null;
  for (;;) {
    const { data, error: propertiesError } = await buildPropertiesQuery(propertiesCursor);
    if (propertiesError) throw new Error(`Falha ao buscar imóveis: ${propertiesError.message}`);
    properties.push(...(data ?? []));
    if (!data || data.length < PROPERTIES_FETCH_PAGE_SIZE) break;
    propertiesCursor = data[data.length - 1].id;
  }

  const propertyById = new Map(properties.map((p) => [p.id, p]));
  const propertyIds = new Set(properties.map((p) => p.id));

  if (propertyIds.size === 0) {
    return { rows: [], totalCount: 0, competitors: allCompetitors ?? [], indicators: EMPTY_INDICATORS };
  }

  // Sem .in("property_id", ...) — ver comentário grande acima da função.
  // Filtros de coluna simples só (data, change_type); RLS restringe à conta.
  //
  // Categoria de filtro -> change_type real no banco (ver comentário no
  // type ChangeType acima). Só filtra na query quando a seleção é um
  // SUBCONJUNTO das 3 categorias — com as 3 marcadas, equivale a "sem
  // filtro", igual já era antes.
  const wantedChangeTypes: PropertyChangeType[] = [];
  if (filters.types.includes("preco")) wantedChangeTypes.push("price");
  if (filters.types.includes("adicionado")) wantedChangeTypes.push("added");
  if (filters.types.includes("disponibilidade")) wantedChangeTypes.push("removed", "reappeared");

  // Paginado explicitamente, mesmo motivo de buildPropertiesQuery acima —
  // um período sem filtro de data (estado válido, ver parse-filters.ts) ou
  // uma conta com meses de histórico pode passar de 1000 property_changes,
  // e sem .range() o PostgREST corta silenciosamente, subcontando mudanças
  // no relatório sem nenhum aviso.
  //
  // Extraído em função (recebe from/to em vez de ler filters.from/to direto)
  // pra poder rodar a MESMA busca+filtragem contra uma janela diferente — o
  // indicador percentual do KpiCard (ver kpi-card.tsx) precisa comparar com
  // o "período anterior" de tamanho igual, com os mesmos filtros de
  // competidor/tipo/direção/status/busca aplicados. `properties`/
  // `propertyById` (concorrente/status/busca) não dependem de data, então
  // são reaproveitados tal qual — só o fetch de property_changes se repete.
  async function fetchFilteredRows(from: string | null, to: string | null): Promise<ReportRow[]> {
    function buildChangesQuery(offset: number) {
      let q = supabase
        .from("property_changes")
        .select("id, property_id, change_type, old_price, new_price, old_status, new_status, detected_at");
      if (from) q = q.gte("detected_at", `${from}T00:00:00.000Z`);
      if (to) q = q.lte("detected_at", `${to}T23:59:59.999Z`);
      if (wantedChangeTypes.length > 0 && wantedChangeTypes.length < 4) {
        q = q.in("change_type", wantedChangeTypes);
      }
      return q.order("detected_at", { ascending: filters.sort === "asc" }).range(offset, offset + CHANGES_FETCH_PAGE_SIZE - 1);
    }

    const changes: ChangeRecord[] = [];
    for (let offset = 0; ; offset += CHANGES_FETCH_PAGE_SIZE) {
      const { data, error: changesError } = await buildChangesQuery(offset);
      if (changesError) throw new Error(`Falha ao buscar mudanças: ${changesError.message}`);
      changes.push(...(data ?? []));
      if (!data || data.length < CHANGES_FETCH_PAGE_SIZE) break;
    }

    function toRow(change: ChangeRecord): ReportRow | null {
      // Interseção com o conjunto de imóveis filtrado (concorrente/status/
      // busca) — é aqui, em JS, que esse filtro acontece agora, não mais
      // numa cláusula .in() na query.
      if (!propertyIds.has(change.property_id)) return null;
      const property = propertyById.get(change.property_id);
      if (!property) return null;
      const meta = competitorMeta.get(property.competitor_id);
      return {
        id: change.id,
        propertyId: property.id,
        competitorId: property.competitor_id,
        competitorName: meta?.name ?? "Concorrente removido",
        competitorAbbreviation: meta?.abbreviation ?? "???",
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
      };
    }

    const candidateRows = changes.map(toRow).filter((r): r is ReportRow => r !== null);

    const needsDirectionFiltering = filters.direction !== "ambos" || filters.minVariation !== null;
    if (!needsDirectionFiltering) return candidateRows;

    return candidateRows.filter((row) => {
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
  }

  // Indicador percentual do KpiCard só existe quando o período tem os dois
  // limites definidos — sem eles, "período anterior de tamanho igual" não
  // tem uma definição sem ambiguidade (decisão confirmada com o usuário:
  // omitir o indicador em vez de mostrar uma comparação mal definida).
  //
  // As duas buscas (período atual + período anterior) não dependem uma da
  // outra — Promise.all em vez de sequencial, achado no mesmo levantamento
  // de performance que trocou o fetch de properties pra keyset acima.
  const comparisonWindow = filters.from && filters.to ? computeComparisonWindow(filters.from, filters.to) : null;
  const [filtered, previousFiltered] = await Promise.all([
    fetchFilteredRows(filters.from, filters.to),
    comparisonWindow ? fetchFilteredRows(comparisonWindow.from, comparisonWindow.to) : Promise.resolve(null),
  ]);

  const totalCount = filtered.length;
  const offset = (filters.page - 1) * PAGE_SIZE;
  const rows = filtered.slice(offset, offset + PAGE_SIZE);

  const previousPeriod: ReportIndicators["previousPeriod"] = previousFiltered
    ? { totalChanges: previousFiltered.length, uniquePropertiesChanged: new Set(previousFiltered.map((r) => r.propertyId)).size }
    : null;

  return {
    rows,
    totalCount,
    competitors: allCompetitors ?? [],
    indicators: { ...computeIndicators(filtered), previousPeriod },
  };
}

// Janela de tamanho igual, imediatamente anterior a [from, to] (ambos
// "YYYY-MM-DD", inclusive) — ex: from=10, to=12 (3 dias) → comparação
// from=07, to=09 (3 dias, terminando no dia anterior ao início do período
// selecionado). Baseado em UTC/dias inteiros, mesma simplificação já usada
// em buildEmptyDailyVolumes (get-dashboard-data.ts) — não é timezone-aware
// por usuário.
function computeComparisonWindow(from: string, to: string): { from: string; to: string } {
  const fromMs = new Date(`${from}T00:00:00.000Z`).getTime();
  const toMs = new Date(`${to}T23:59:59.999Z`).getTime();
  const spanMs = toMs - fromMs;
  const comparisonToMs = fromMs - 1;
  const comparisonFromMs = comparisonToMs - spanMs;
  return {
    from: new Date(comparisonFromMs).toISOString().slice(0, 10),
    to: new Date(comparisonToMs).toISOString().slice(0, 10),
  };
}
