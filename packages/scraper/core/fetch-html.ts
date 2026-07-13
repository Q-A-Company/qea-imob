import { assertAllowedByRobots, RobotsDisallowedError } from "./robots.js";

export { RobotsDisallowedError };

const USER_AGENT = "Q&A Imob Bot/1.0 (contato@qeacompany.com.br)";

const DEFAULT_TIMEOUT_MS = 20_000;

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

export interface FetchHtmlResult {
  html: string;
  status: number;
}

export async function fetchListingHtml(
  url: string,
  options?: { timeoutMs?: number; respectRobotsTxt?: boolean }
): Promise<FetchHtmlResult> {
  const respectRobotsTxt = options?.respectRobotsTxt ?? true;

  if (respectRobotsTxt) {
    await assertAllowedByRobots(url);
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
