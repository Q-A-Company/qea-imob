import { fetchListingHtml } from "../core/fetch-html.js";
import { extractAllPagesFromHtml } from "../core/html-paginator.js";
import { extractFromJsonApi } from "../core/json-api-extractor.js";
import type { SiteConfigSelectors } from "../ai/site-config-schema.js";
import type { ExtractedProperty } from "../core/types.js";

export interface RunPriceCheckResult {
  properties: ExtractedProperty[];
  pagesFetched: number;
  duplicateExternalIds: string[];
  cardsWithoutPrice: number;
  cardsWithoutExternalId: number;
  // true quando a extração parou por falha de rede/servidor (não por ter
  // legitimamente chegado ao fim do catálogo) — dados PARCIAIS. O chamador
  // (scheduler, Etapa 5) deve registrar isso em scraper_runs como falha
  // parcial, não sucesso pleno, mesmo que properties não esteja vazio.
  stoppedEarlyDueToError: boolean;
  // Motivo real da falha (status HTTP ou mensagem de exceção), quando
  // conhecido — null se stoppedEarlyDueToError for false, ou se a falha
  // veio de uma exceção que já propaga sozinha pro chamador (ver
  // checkCompetitor: falha na 1ª página html_css não passa por aqui).
  stoppedEarlyErrorReason: string | null;
  // Total declarado pela própria fonte, quando existe — só json_api expõe
  // isso hoje (via total_field); html_css não tem esse conceito na
  // checagem de rotina (a paginação segue até não achar mais página, sem
  // nenhum "total" declarado em separado), então fica sempre null nesse
  // caminho. Usado por check-competitor.ts pra detectar cobertura baixa.
  totalDeclared: number | null;
}

// Etapa 4: extração determinística de rotina — usa a site_config JÁ SALVA
// (html_css ou json_api), sem nenhuma chamada de IA. É o que o scheduler
// (Etapa 5) roda a cada polling_interval_minutes por concorrente. Reaproveita
// a mesma lógica de paginação/retry/backoff validada na Etapa 3
// (html-paginator.ts e json-api-extractor.ts) — nada novo foi inventado
// aqui, só um ponto de entrada único que decide qual dos dois usar.
export async function runPriceCheck(params: {
  listingUrl: string;
  config: SiteConfigSelectors;
}): Promise<RunPriceCheckResult> {
  if (params.config.strategy === "json_api") {
    const result = await extractFromJsonApi(params.config);
    return {
      properties: result.properties,
      pagesFetched: result.pagesFetched,
      duplicateExternalIds: result.duplicateExternalIds,
      cardsWithoutPrice: 0,
      cardsWithoutExternalId: result.itemsSkippedMissingField,
      stoppedEarlyDueToError: result.stoppedEarlyDueToError,
      stoppedEarlyErrorReason: result.stoppedEarlyErrorReason,
      totalDeclared: result.total,
    };
  }

  const { html } = await fetchListingHtml(params.listingUrl);
  const result = await extractAllPagesFromHtml({
    firstPageUrl: params.listingUrl,
    firstPageHtml: html,
    config: params.config,
  });

  return {
    properties: result.properties,
    pagesFetched: result.pagesFetched,
    duplicateExternalIds: result.duplicateExternalIds,
    cardsWithoutPrice: result.cardsWithoutPrice,
    cardsWithoutExternalId: result.cardsWithoutExternalId,
    stoppedEarlyDueToError: result.stoppedReason === "fetch_failed",
    // Mesmo padrão de detalhe que já existia pro json_api — html-paginator.ts
    // (fetchHtmlWithRetry, página 2+) agora também propaga o motivo real da
    // falha em vez de só devolver html: null. Falha na 1ª página nem passa
    // por este branch (fetchListingHtml lança direto, propaga com a
    // mensagem real via o catch em checkCompetitor).
    stoppedEarlyErrorReason: result.stoppedEarlyErrorReason,
    totalDeclared: null,
  };
}
