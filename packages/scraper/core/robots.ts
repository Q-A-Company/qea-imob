// Checagem de robots.txt — compartilhada entre fetch-html.ts (html_css,
// já existia ali) e json-api-extractor.ts/json-api-detector.ts (json_api,
// não tinha nenhuma checagem até esta mudança). Extraído pra módulo próprio
// porque agora é usado por mais de um caminho de extração — antes vivia só
// dentro de fetch-html.ts, que faz sentido pra HTML mas não deveria ser
// importado só por causa desta função pelo lado json_api (puxaria
// fetchListingHtml/HttpStatusError junto, sem relação com API JSON).
export class RobotsDisallowedError extends Error {
  constructor(url: string) {
    super(`robots.txt disallows fetching ${url}`);
    this.name = "RobotsDisallowedError";
  }
}

const USER_AGENT = "Q&A Imob Bot/1.0 (contato@qeacompany.com.br)";

interface Rule {
  type: "allow" | "disallow";
  value: string;
}

// Converte um valor de Disallow/Allow (podendo ter "*" = qualquer sequência
// de caracteres, e "$" no final = ancora fim da URL) numa regex de PREFIXO.
// Achado real (investigação da poemma.com.br): a implementação anterior
// tratava o valor como prefixo literal (`pathname.startsWith(valor)`) — uma
// regra comum tipo "Disallow: */busca*" nunca batia (pathname nunca começa
// literalmente com o caractere "*"), então uma proibição explícita e real
// era silenciosamente ignorada, devolvendo "permitido" quando deveria
// bloquear. "*"/"$" são convenção padrão de fato (Google, Bing, e a
// RFC 9309) mesmo não estando no RFC original de 1994.
function ruleToRegex(value: string): RegExp {
  const hasEndAnchor = value.endsWith("$");
  const body = hasEndAnchor ? value.slice(0, -1) : value;
  const escaped = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}${hasEndAnchor ? "$" : ""}`);
}

// Regra mais ESPECÍFICA vence quando Allow e Disallow batem na mesma URL —
// mesmo critério documentado pelo Google (comprimento do valor da regra
// ANTES de virar regex, não da regex resultante). Sem isso, um site com
// "Disallow: /busca" + "Allow: /busca/publico" bloquearia até a exceção
// explícita que ele mesmo concedeu.
function isAllowedByRules(pathname: string, rules: Rule[]): boolean {
  let bestMatch: Rule | null = null;
  for (const rule of rules) {
    if (!ruleToRegex(rule.value).test(pathname)) continue;
    if (!bestMatch || rule.value.length > bestMatch.value.length) bestMatch = rule;
  }
  return bestMatch === null || bestMatch.type === "allow";
}

export async function isAllowedByRobots(url: string): Promise<boolean> {
  const target = new URL(url);
  const robotsUrl = `${target.origin}/robots.txt`;

  let robotsTxt: string;
  try {
    const res = await fetch(robotsUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return true; // sem robots.txt (ou erro) => sem restrição conhecida
    robotsTxt = await res.text();
  } catch {
    return true; // falha ao buscar robots.txt não deve bloquear a checagem
  }

  let appliesToUs = false;
  const rules: Rule[] = [];

  for (const rawLine of robotsTxt.split("\n")) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;

    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      appliesToUs = value === "*";
    } else if (appliesToUs && key === "disallow" && value) {
      rules.push({ type: "disallow", value });
    } else if (appliesToUs && key === "allow" && value) {
      rules.push({ type: "allow", value });
    }
  }

  // path + query — regras de robots.txt valem sobre a URL inteira que seria
  // requisitada, não só o path (ex: "Disallow: /*?filtro=" bloquearia um
  // parâmetro específico, não a rota em si).
  return isAllowedByRules(`${target.pathname}${target.search}`, rules);
}

// Lança se a URL estiver bloqueada — ponto único que os 3 caminhos de
// requisição (HTML da listagem, endpoint json_api de rotina, candidatos
// json_api durante o aprendizado) chamam antes de qualquer fetch de dado
// de verdade. Não cacheia entre chamadas de propósito: o robots.txt pode
// mudar entre uma checagem/recalibração e outra (ver README) — cada
// requisição de aprendizado/extração relevante confere de novo.
export async function assertAllowedByRobots(url: string): Promise<void> {
  if (!(await isAllowedByRobots(url))) {
    throw new RobotsDisallowedError(url);
  }
}
