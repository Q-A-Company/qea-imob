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
  const disallowed: string[] = [];

  for (const rawLine of robotsTxt.split("\n")) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;

    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      appliesToUs = value === "*";
    } else if (appliesToUs && key === "disallow" && value) {
      disallowed.push(value);
    }
  }

  return !disallowed.some((prefix) => target.pathname.startsWith(prefix));
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
