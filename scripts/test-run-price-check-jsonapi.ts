import { runPriceCheck } from "../packages/scraper/jobs/run-price-check.js";
import type { JsonApiSiteConfig } from "../packages/scraper/ai/site-config-schema.js";

const config: JsonApiSiteConfig = {
  strategy: "json_api",
  http_method: "GET",
  request_body_template: null,
  endpoint_url: "https://www.sentineliesobral.com.br/api/anuncios/search?finalidade=venda&page={page}",
  starting_page: 1,
  page_increment: 1,
  items_field: "items",
  total_field: "total",
  external_id_field: "codigo",
  price_field: "valorVenda",
  price_unavailable_field: "ocultarValor",
  property_url_field: "url",
  property_url_base: "https://www.sentineliesobral.com.br/imovel/",
  property_url_suffix_field: "codigo",
  confidence_score: 0.95,
  warnings: [],
};

// Limita a 2 páginas só pra confirmar que o dispatcher roteia certo pra
// extractFromJsonApi — a extração completa já foi validada (1.409/1.409)
// na Etapa 3, não precisa repetir aqui.
let pageCount = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = ((...args) => {
  pageCount++;
  if (pageCount > 2) return Promise.resolve(new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }));
  return originalFetch(...args);
}) as typeof fetch;

const result = await runPriceCheck({ listingUrl: config.endpoint_url, config });
console.log(`Estratégia usada: json_api (via dispatcher)`);
console.log(`Páginas percorridas: ${result.pagesFetched}`);
console.log(`Imóveis capturados: ${result.properties.length}`);
console.log(`Parou cedo por erro: ${result.stoppedEarlyDueToError}`);
console.log("Amostra:", JSON.stringify(result.properties.slice(0, 2), null, 2));
