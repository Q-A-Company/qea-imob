import { fetchListingHtml } from "../core/fetch-html.js";
import { extractAllPagesFromHtml } from "../core/html-paginator.js";
import { extractFromJsonApi } from "../core/json-api-extractor.js";
import type { SiteConfigSelectors } from "../ai/site-config-schema.js";
import type { ExtractedProperty } from "../core/types.js";

export interface RunPriceCheckResult {
  properties: ExtractedProperty[];
  pagesFetched: number;
  // vazio para json_api hoje — extractFromJsonApi não dedupe entre páginas
  // (cada item de resposta paginada é assumido único pela API de origem;
  // não observamos duplicata real em nenhum dos sites json_api validados).
  duplicateExternalIds: string[];
  cardsWithoutPrice: number;
  cardsWithoutExternalId: number;
  // true quando a extração parou por falha de rede/servidor (não por ter
  // legitimamente chegado ao fim do catálogo) — dados PARCIAIS. O chamador
  // (scheduler, Etapa 5) deve registrar isso em scraper_runs como falha
  // parcial, não sucesso pleno, mesmo que properties não esteja vazio.
  stoppedEarlyDueToError: boolean;
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
      duplicateExternalIds: [],
      cardsWithoutPrice: 0,
      cardsWithoutExternalId: result.itemsSkippedMissingField,
      stoppedEarlyDueToError: result.stoppedEarlyDueToError,
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
  };
}
