// Parser de preço em formato brasileiro (ex: "R$ 1.607.000", "1.607.000,50")
// — extraído de html-extractor.ts pra ser reutilizado também por
// json-api-extractor.ts (sites json_api cuja API só expõe o preço já
// formatado como texto, sem campo numérico bruto — ver site-config-schema.ts
// price_is_formatted_text). Remove tudo que não é dígito/separador, decide
// se "," é separador decimal (formato BR) e normaliza pra ponto flutuante.
export function parsePriceBR(raw: string): number | null {
  const digitsAndSeparators = raw.replace(/[^\d.,]/g, "");
  if (!digitsAndSeparators) return null;

  const normalized = digitsAndSeparators.includes(",")
    ? digitsAndSeparators.replace(/\./g, "").replace(",", ".")
    : digitsAndSeparators.replace(/\./g, "");

  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}
