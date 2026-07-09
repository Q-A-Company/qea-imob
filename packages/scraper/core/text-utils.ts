// Prefixos comuns em referências de imóveis brasileiros (ex: "Ref: 0028",
// "Cod.: 5105", "Código:CWCN40306") — removidos para guardar só o código
// puro como external_id. A extração de mudança de preço funcionaria mesmo
// sem isso (o valor fica consistente entre checagens), mas o código limpo é
// o que aparece pro usuário nas telas de histórico.
const KNOWN_PREFIXES = /^(ref(er[eê]ncia)?|c[oó]d(igo)?)\.?\s*:?\s*/i;

export function normalizeExternalId(raw: string): string {
  return raw.replace(KNOWN_PREFIXES, "").trim();
}
