const USER_AGENT = "Q&A Imob Bot/1.0 (contato@qeacompany.com.br)";

const DEFAULT_TIMEOUT_MS = 20_000;

export class RobotsDisallowedError extends Error {
  constructor(url: string) {
    super(`robots.txt disallows fetching ${url}`);
    this.name = "RobotsDisallowedError";
  }
}

// Carrega o status HTTP de verdade — necessário pra html-paginator.ts
// distinguir um 404 estrutural de fim de paginação (numeração numerada que
// não tem mais páginas além da última real, ex: WordPress) de uma falha de
// rede/servidor de verdade (5xx, timeout). Sem isso, os dois casos eram
// lançados como o mesmo `Error` genérico e tratados como falha real —
// pausando o concorrente pelo circuit breaker mesmo quando a extração
// completou com sucesso, e desligando permanentemente a detecção de
// "possivelmente vendido" (que exige stopped_early_due_to_error=false).
export class HttpStatusError extends Error {
  constructor(
    public readonly status: number,
    url: string
  ) {
    super(`Falha ao buscar ${url}: HTTP ${status}`);
    this.name = "HttpStatusError";
  }
}

async function isAllowedByRobots(url: string): Promise<boolean> {
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

export interface FetchHtmlResult {
  html: string;
  status: number;
}

export async function fetchListingHtml(
  url: string,
  options?: { timeoutMs?: number; respectRobotsTxt?: boolean }
): Promise<FetchHtmlResult> {
  const respectRobotsTxt = options?.respectRobotsTxt ?? true;

  if (respectRobotsTxt && !(await isAllowedByRobots(url))) {
    throw new RobotsDisallowedError(url);
  }

  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new HttpStatusError(res.status, url);
  }

  return { html: await res.text(), status: res.status };
}
