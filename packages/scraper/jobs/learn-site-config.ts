import { fetchListingHtml } from "../core/fetch-html.js";
import { extractFromHtml } from "../core/html-extractor.js";
import { extractFromJsonApi } from "../core/json-api-extractor.js";
import { generateSiteConfig } from "../ai/config-generator.js";
import { detectJsonApi } from "../ai/json-api-detector.js";
import { checkExternalIdSanity } from "../ai/site-config-compatibility.js";
import type { SiteConfigSelectors } from "../ai/site-config-schema.js";
import type { ExtractedProperty } from "../core/types.js";

export interface LearnSiteConfigResult {
  listingUrl: string;
  selectors: SiteConfigSelectors;
  preview: ExtractedProperty[];
  stats: {
    cardsFound: number;
    cardsWithoutExternalId: number;
    cardsWithoutPrice: number;
    originalHtmlLength: number;
    cleanedHtmlLength: number;
    totalListingsHint: number | null;
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  jsonApiDetection: "not_attempted" | "not_found" | "found";
  jsonApiStoppedEarlyDueToError: boolean;
  // false quando o external_id gerado falhou na checagem de sanidade (ex:
  // aponta pro mesmo campo do preço) — nesse caso confidence_score já vem
  // rebaixado e um warning explícito foi injetado, mas o chamador (Etapa 10
  // / Etapa 7) deve tratar isso como bloqueio de ativação automática, não
  // só mais um warning entre outros.
  externalIdSanityOk: boolean;
}

// Cobertura abaixo desse limite (relativa ao total que a própria página
// diz ter) dispara a tentativa automática de detecção de API JSON — o
// mesmo gatilho que levou à investigação manual de sentineliesobral.
const LOW_COVERAGE_RATIO = 0.5;

// Aplica a checagem de sanidade do external_id e, se falhar, rebaixa a
// confiança e injeta um warning explícito — não deixa o problema passar
// silenciosamente escondido dentro de um confidence_score que por acaso
// já estava baixo por outro motivo.
function applyExternalIdSanity<T extends SiteConfigSelectors>(selectors: T): { selectors: T; sanityOk: boolean } {
  const sanity = checkExternalIdSanity(selectors);
  if (sanity.compatible) return { selectors, sanityOk: true };

  return {
    selectors: {
      ...selectors,
      confidence_score: Math.min(selectors.confidence_score, 0.2),
      warnings: [...selectors.warnings, ...sanity.reasons.map((r) => `[VALIDAÇÃO AUTOMÁTICA] ${r}`)],
    },
    sanityOk: false,
  };
}

// Fluxo de aprendizado via IA, com fallback automático para json_api quando
// html_css captura só uma fração do catálogo:
//   1. Busca o HTML e gera o site_config html_css via IA.
//   2. Roda extração de teste contra o HTML completo.
//   3. Se a cobertura ficar muito abaixo do total anunciado pela própria
//      página (ou zero cards), tenta detectar automaticamente um endpoint
//      JSON por trás da paginação (json-api-detector.ts) — varredura real
//      de scripts + teste de candidatos + confirmação empírica de
//      paginação, não suposição da IA.
//   4. Se encontrar um json_api válido, prefere ele; senão, fica com o
//      html_css (mesmo com cobertura parcial) e marca isso nos stats/warnings
//      para o Admin decidir (ou para o self-healing sinalizar 'degradado').
// Em todo caso, o external_id gerado passa por checkExternalIdSanity antes
// de qualquer coisa ser retornada (ver applyExternalIdSanity).
export async function learnSiteConfig(listingUrl: string): Promise<LearnSiteConfigResult> {
  const { html } = await fetchListingHtml(listingUrl);

  const generated = await generateSiteConfig({ html, listingUrl });
  const { selectors: htmlSelectors, sanityOk: htmlSanityOk } = applyExternalIdSanity(generated.selectors);
  const htmlExtraction = extractFromHtml(html, htmlSelectors, listingUrl);

  const totalHint = htmlSelectors.total_listings_hint;
  const coverageLooksLow =
    htmlExtraction.cardsFound === 0 || (totalHint !== null && htmlExtraction.cardsFound < totalHint * LOW_COVERAGE_RATIO);

  const baseResult = {
    listingUrl,
    stats: {
      cardsFound: htmlExtraction.cardsFound,
      cardsWithoutExternalId: htmlExtraction.cardsWithoutExternalId,
      cardsWithoutPrice: htmlExtraction.cardsWithoutPrice,
      originalHtmlLength: generated.originalHtmlLength,
      cleanedHtmlLength: generated.cleanedHtmlLength,
      totalListingsHint: totalHint,
    },
    usage: generated.usage,
  };

  if (!coverageLooksLow) {
    return {
      ...baseResult,
      selectors: htmlSelectors,
      preview: htmlExtraction.properties.slice(0, 10),
      jsonApiDetection: "not_attempted",
      jsonApiStoppedEarlyDueToError: false,
      externalIdSanityOk: htmlSanityOk,
    };
  }

  const detected = await detectJsonApi({
    listingHtml: html,
    listingUrl,
    knownRealProperties: htmlExtraction.properties,
    totalListingsHint: totalHint,
  });

  if (!detected) {
    return {
      ...baseResult,
      selectors: htmlSelectors,
      preview: htmlExtraction.properties.slice(0, 10),
      jsonApiDetection: "not_found",
      jsonApiStoppedEarlyDueToError: false,
      externalIdSanityOk: htmlSanityOk,
    };
  }

  const { selectors: jsonSelectors, sanityOk: jsonSanityOk } = applyExternalIdSanity(detected.config);
  const jsonExtraction = await extractFromJsonApi(jsonSelectors);

  return {
    ...baseResult,
    selectors: jsonSelectors,
    preview: jsonExtraction.properties.slice(0, 10),
    stats: {
      ...baseResult.stats,
      cardsFound: jsonExtraction.properties.length,
      cardsWithoutExternalId: jsonExtraction.itemsSkippedMissingField,
    },
    jsonApiDetection: "found",
    jsonApiStoppedEarlyDueToError: jsonExtraction.stoppedEarlyDueToError,
    externalIdSanityOk: jsonSanityOk,
  };
}
