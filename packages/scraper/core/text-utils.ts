// Prefixos comuns em referências de imóveis brasileiros (ex: "Ref: 0028",
// "Cod.: 5105", "Código:CWCN40306") — removidos para guardar só o código
// puro como external_id. A extração de mudança de preço funcionaria mesmo
// sem isso (o valor fica consistente entre checagens), mas o código limpo é
// o que aparece pro usuário nas telas de histórico.
const KNOWN_PREFIXES = /^(ref(er[eê]ncia)?|c[oó]d(igo)?)\.?\s*:?\s*/i;

export function normalizeExternalId(raw: string): string {
  return raw.replace(KNOWN_PREFIXES, "").trim();
}

// Token final do slug que parece um ID técnico, não parte do título legível
// (ex: "mu9857", "48213", "id203") — poucas letras (0-3) coladas em vários
// dígitos (3+), em qualquer ordem, ou puramente numérico. Usado só pra
// decidir o que CORTAR do fim do slug, nunca pra rejeitar o slug inteiro.
const ID_LIKE_TOKEN = /^[a-z]{0,3}\d{3,}[a-z]{0,3}$|^\d+$/i;

// Camada 1 de identificação de imóvel removido sem reference_code (ver
// ExtractedProperty.image_url/attributes pras camadas 2/3, core/types.ts) —
// deriva um rótulo legível a partir do slug já presente em properties.url,
// sem depender de nenhuma captura nova. Por isso funciona RETROATIVAMENTE
// pra imóveis já removidos hoje: a URL sempre foi salva, mesmo antes desta
// mudança. Heurística, não garantida — alguns sites usam slugs puramente
// numéricos/técnicos (ex: "/imovel/48213") sem nada legível; nesses casos
// devolve null e o fallback de exibição continua "Ver imóvel" sem contexto
// extra, em vez de forçar um rótulo que não existe.
export function extractLabelFromUrl(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url;
  }

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  let slug = segments[segments.length - 1];
  try {
    slug = decodeURIComponent(slug);
  } catch {
    // slug com % mal-formado — segue com o valor bruto em vez de falhar.
  }
  slug = slug.replace(/\.(html?|php|aspx?)$/i, "");

  const words = slug.split("-").filter(Boolean);
  // Depois de já ter cortado pelo menos um token numérico do final, uma
  // letra solta de 1 caractere (ex: o "r" que sobra de "R$" em preços
  // embutidos no slug, tipo "...-r-11-990-00000") também é resíduo, não
  // parte do título — corta junto. Só vale DEPOIS de já ter cortado algo
  // numérico (strippedAny): uma letra solta no fim SEM nenhum número por
  // perto (ex: "torre-a", "bloco-b") pode ser identificação real de
  // torre/bloco, então não é tocada nesse caso.
  let strippedAny = false;
  while (words.length > 0) {
    const last = words[words.length - 1];
    if (ID_LIKE_TOKEN.test(last)) {
      words.pop();
      strippedAny = true;
      continue;
    }
    if (strippedAny && last.length === 1) {
      words.pop();
      continue;
    }
    break;
  }
  if (words.length === 0) return null;

  const label = words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  // Rótulo curto demais (ex: sobrou só "N" de um slug quase todo numérico)
  // não é mais legível que o fallback padrão — não vale a pena mostrar.
  return label.length >= 3 ? label : null;
}
