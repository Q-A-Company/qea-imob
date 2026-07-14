import * as cheerio from "cheerio";
import { fetchListingHtml, HttpStatusError } from "./fetch-html.js";
import { extractFromHtml } from "./html-extractor.js";
import type { HtmlCssSiteConfig } from "../ai/site-config-schema.js";
import type { ExtractedProperty } from "./types.js";

export interface PaginatedExtractionResult {
  properties: ExtractedProperty[];
  pagesFetched: number;
  duplicateExternalIds: string[];
  // cardsWithoutPrice: card tinha referência e link, mas o campo de preço
  // veio vazio — distinto de um card com marcador genuíno de "Sob Consulta"
  // (esse caso já vira price_status: "sob_consulta" normalmente). Preço
  // ausente do card pode significar que só existe na página de detalhe do
  // imóvel — não dá pra monitorar mudança de preço nesses casos sem visitar
  // cada página individual.
  cardsWithoutPrice: number;
  cardsWithoutExternalId: number;
  stoppedReason:
    // chegou numa página que respondeu normalmente mas sem nenhum card —
    // fim legítimo da paginação, não é falha.
    | "no_more_pages"
    // uma página falhou em carregar mesmo após todas as tentativas de
    // retry/backoff — extração parou com dados PARCIAIS, isso é uma falha
    // real (distinto de "no_more_pages"), scraper_runs deve registrar como
    // tal, não como sucesso completo.
    | "fetch_failed"
    | "all_duplicates"
    | "max_pages"
    | "pagination_type_unsupported";
  // Motivo real da falha, só preenchido quando stoppedReason === "fetch_failed"
  // — status HTTP (ex: "HTTP 500") ou mensagem de exceção de rede/timeout.
  // Propagado até RunPriceCheckResult.stoppedEarlyErrorReason →
  // scraper_runs.error_message, mesmo caminho que já existia pro json_api
  // (JsonApiExtractionResult.stoppedEarlyErrorReason).
  stoppedEarlyErrorReason: string | null;
}

const MAX_PAGES = 300;
const DELAY_BETWEEN_PAGES_MS = 500;
const MAX_RETRIES = 5;
const RETRY_BASE_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface PageFetchResult {
  html: string | null;
  // true quando a resposta foi um 404 específico — sinal de fim natural da
  // paginação numerada (a página seguinte à última real simplesmente não
  // existe, ex: WordPress), não uma falha de rede/servidor. Confirmado
  // empiricamente contra mullerimoveisrj.com.br: página 135 (real) responde
  // 200, página 136 (além do fim) responde 404 de forma consistente — não é
  // instabilidade passageira, é o comportamento normal do site. Por isso um
  // 404 nem entra no loop de retry (retry não muda um 404 estrutural) e é
  // tratado como stoppedReason "no_more_pages", não "fetch_failed", no
  // chamador — sem essa distinção, TODA checagem real desse tipo de site
  // reportava falha de rede permanentemente, disparando o circuit breaker
  // (pausa automática após 3 checagens) e desligando pra sempre a inferência
  // de "possivelmente vendido" (que exige stopped_early_due_to_error=false).
  notFound: boolean;
  // Motivo real da falha definitiva (esgotou os retries) — null quando html
  // não é null, ou quando notFound é true (fim natural da paginação, não é
  // uma falha real). Mesmo padrão de FetchJsonResult.errorReason em
  // json-api-extractor.ts (fetchJsonWithRetry) — antes disso existir aqui,
  // esse caminho (página 2+ do html_css) tinha o MESMO gap que o json_api já
  // teve corrigido: o status HTTP/mensagem real do erro era descartado
  // dentro do catch, nunca chegava até scraper_runs.error_message.
  errorReason: string | null;
}

async function fetchHtmlWithRetry(url: string): Promise<PageFetchResult> {
  let lastErrorReason: string | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { html } = await fetchListingHtml(url);
      return { html, notFound: false, errorReason: null };
    } catch (err) {
      if (err instanceof HttpStatusError && err.status === 404) {
        return { html: null, notFound: true, errorReason: null };
      }
      // outro erro (5xx, timeout, rede) — pode ser transitório, tenta de
      // novo com backoff, mas guarda a mensagem real caso essa seja a
      // última tentativa (mesmo raciocínio de fetchJsonWithRetry).
      lastErrorReason = err instanceof HttpStatusError ? `HTTP ${err.status}` : err instanceof Error ? err.message : String(err);
    }
    if (attempt < MAX_RETRIES) await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
  }
  return { html: null, notFound: false, errorReason: lastErrorReason };
}

// Acha, dentro do HTML da página 1, os links reais para as páginas 2 e 3 da
// paginação (por texto == "2" / "3") e monta um template substituindo só o
// trecho onde as duas URLs realmente divergem — evita regex especulativo
// tipo "/page/N/" que pode não bater com o padrão real do site.
function discoverPathSegmentTemplate(page1Html: string, page1Url: string): ((page: number) => string) | null {
  const $ = cheerio.load(page1Html);
  let href2: string | null = null;
  let href3: string | null = null;

  $("a").each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr("href");
    if (!href) return;
    if (text === "2" && !href2) href2 = new URL(href, page1Url).toString();
    if (text === "3" && !href3) href3 = new URL(href, page1Url).toString();
  });

  if (!href2 || !href3) return null;
  // TS não estreita `let` capturadas em closures — copia pra const fresca.
  const h2: string = href2;
  const h3: string = href3;

  let diffStart = -1;
  const minLen = Math.min(h2.length, h3.length);
  for (let i = 0; i < minLen; i++) {
    if (h2[i] !== h3[i]) {
      diffStart = i;
      break;
    }
  }
  if (diffStart === -1) return null;

  // encontra o fim do número em cada href a partir do ponto de divergência
  let end2 = diffStart;
  while (end2 < h2.length && /\d/.test(h2[end2])) end2++;
  let end3 = diffStart;
  while (end3 < h3.length && /\d/.test(h3[end3])) end3++;

  const prefix = h2.slice(0, diffStart);
  const suffix2 = h2.slice(end2);
  const suffix3 = h3.slice(end3);
  if (suffix2 !== suffix3) return null; // não é só o número que muda — desiste

  return (page: number) => `${prefix}${page}${suffix2}`;
}

export async function extractAllPagesFromHtml(params: {
  firstPageUrl: string;
  firstPageHtml: string;
  config: HtmlCssSiteConfig;
}): Promise<PaginatedExtractionResult> {
  const { firstPageUrl, firstPageHtml, config } = params;

  const firstPageResult = extractFromHtml(firstPageHtml, config, firstPageUrl);
  const properties: ExtractedProperty[] = [...firstPageResult.properties];
  const seenIds = new Set(properties.map((p) => p.external_id));
  const duplicateExternalIds: string[] = [];
  let pagesFetched = 1;
  let cardsWithoutPrice = firstPageResult.cardsWithoutPrice;
  let cardsWithoutExternalId = firstPageResult.cardsWithoutExternalId;

  let buildPageUrl: ((page: number) => string) | null = null;

  if (config.pagination.type === "query_param" && config.pagination.param_name) {
    const paramName = config.pagination.param_name;
    buildPageUrl = (page: number) => {
      const url = new URL(firstPageUrl);
      url.searchParams.set(paramName, String(page));
      return url.toString();
    };
  } else if (config.pagination.type === "path_segment") {
    buildPageUrl = discoverPathSegmentTemplate(firstPageHtml, firstPageUrl);
  }

  if (!buildPageUrl) {
    return {
      properties,
      pagesFetched,
      duplicateExternalIds,
      cardsWithoutPrice,
      cardsWithoutExternalId,
      stoppedReason: config.pagination.type === "none" ? "no_more_pages" : "pagination_type_unsupported",
      stoppedEarlyErrorReason: null,
    };
  }

  for (let page = 2; page <= MAX_PAGES; page++) {
    const { html, notFound, errorReason } = await fetchHtmlWithRetry(buildPageUrl(page));
    if (notFound) {
      return {
        properties,
        pagesFetched,
        duplicateExternalIds,
        cardsWithoutPrice,
        cardsWithoutExternalId,
        stoppedReason: "no_more_pages",
        stoppedEarlyErrorReason: null,
      };
    }
    if (html === null) {
      return {
        properties,
        pagesFetched,
        duplicateExternalIds,
        cardsWithoutPrice,
        cardsWithoutExternalId,
        stoppedReason: "fetch_failed",
        stoppedEarlyErrorReason: errorReason,
      };
    }

    const pageResult = extractFromHtml(html, config, firstPageUrl);
    pagesFetched++;
    cardsWithoutPrice += pageResult.cardsWithoutPrice;
    cardsWithoutExternalId += pageResult.cardsWithoutExternalId;

    if (pageResult.properties.length === 0) {
      return {
        properties,
        pagesFetched,
        duplicateExternalIds,
        cardsWithoutPrice,
        cardsWithoutExternalId,
        stoppedReason: "no_more_pages",
        stoppedEarlyErrorReason: null,
      };
    }

    let newCount = 0;
    for (const prop of pageResult.properties) {
      if (seenIds.has(prop.external_id)) {
        duplicateExternalIds.push(prop.external_id);
        continue;
      }
      seenIds.add(prop.external_id);
      properties.push(prop);
      newCount++;
    }

    if (newCount === 0) {
      return {
        properties,
        pagesFetched,
        duplicateExternalIds,
        cardsWithoutPrice,
        cardsWithoutExternalId,
        stoppedReason: "all_duplicates",
        stoppedEarlyErrorReason: null,
      };
    }

    await sleep(DELAY_BETWEEN_PAGES_MS);
  }

  return {
    properties,
    pagesFetched,
    duplicateExternalIds,
    cardsWithoutPrice,
    cardsWithoutExternalId,
    stoppedReason: "max_pages",
    stoppedEarlyErrorReason: null,
  };
}
