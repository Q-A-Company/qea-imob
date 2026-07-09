import * as cheerio from "cheerio";
import { fetchListingHtml } from "./fetch-html.js";
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
}

const MAX_PAGES = 300;
const DELAY_BETWEEN_PAGES_MS = 500;
const MAX_RETRIES = 5;
const RETRY_BASE_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHtmlWithRetry(url: string): Promise<string | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { html } = await fetchListingHtml(url);
      return html;
    } catch {
      // tenta de novo com backoff
    }
    if (attempt < MAX_RETRIES) await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
  }
  return null;
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
    };
  }

  for (let page = 2; page <= MAX_PAGES; page++) {
    const html = await fetchHtmlWithRetry(buildPageUrl(page));
    if (html === null) {
      return { properties, pagesFetched, duplicateExternalIds, cardsWithoutPrice, cardsWithoutExternalId, stoppedReason: "fetch_failed" };
    }

    const pageResult = extractFromHtml(html, config, firstPageUrl);
    pagesFetched++;
    cardsWithoutPrice += pageResult.cardsWithoutPrice;
    cardsWithoutExternalId += pageResult.cardsWithoutExternalId;

    if (pageResult.properties.length === 0) {
      return { properties, pagesFetched, duplicateExternalIds, cardsWithoutPrice, cardsWithoutExternalId, stoppedReason: "no_more_pages" };
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
      return { properties, pagesFetched, duplicateExternalIds, cardsWithoutPrice, cardsWithoutExternalId, stoppedReason: "all_duplicates" };
    }

    await sleep(DELAY_BETWEEN_PAGES_MS);
  }

  return { properties, pagesFetched, duplicateExternalIds, cardsWithoutPrice, cardsWithoutExternalId, stoppedReason: "max_pages" };
}
