import type { ReportFilters, ChangeType, Direction, PropertyStatusFilter } from "./get-report-data";
import { defaultDateRange } from "./default-date-range";

export type SearchParams = Record<string, string | string[] | undefined>;

// Sem NENHUM parâmetro na URL (primeira visita) → aplica o padrão de 30
// dias. Se from/to estiverem presentes mas vazios (usuário limpou os campos
// e reaplicou o filtro) → sem limite de data, de propósito, não confunde
// "nunca configurado" com "removido explicitamente".
export function parseFilters(searchParams: SearchParams): ReportFilters {
  const get = (key: string): string | undefined => {
    const v = searchParams[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const hasFrom = "from" in searchParams;
  const hasTo = "to" in searchParams;
  let from: string | null;
  let to: string | null;
  if (!hasFrom && !hasTo) {
    const d = defaultDateRange();
    from = d.from;
    to = d.to;
  } else {
    from = get("from") || null;
    to = get("to") || null;
  }

  const competitorsRaw = get("competitors");
  const competitorIds = competitorsRaw ? competitorsRaw.split(",").filter(Boolean) : null;

  const typesRaw = get("types");
  const parsedTypes = typesRaw ? (typesRaw.split(",").filter(Boolean) as ChangeType[]) : (["preco", "disponibilidade"] as ChangeType[]);
  const types = parsedTypes.length > 0 ? parsedTypes : (["preco", "disponibilidade"] as ChangeType[]);

  const direction = (get("direction") as Direction) || "ambos";
  const status = (get("status") as PropertyStatusFilter) || "ambos";
  const search = get("search")?.trim() || null;
  const sort = get("sort") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(get("page")) || 1);

  const minVariationRaw = get("minVariation");
  const minVariationUnit = get("minVariationUnit") === "percent" ? "percent" : "reais";
  const minVariationValue = minVariationRaw ? Number(minVariationRaw) : null;
  const minVariation = minVariationValue !== null && Number.isFinite(minVariationValue) && minVariationValue > 0
    ? { value: minVariationValue, unit: minVariationUnit as "reais" | "percent" }
    : null;

  return { competitorIds, from, to, types, direction, minVariation, status, search, sort, page };
}
