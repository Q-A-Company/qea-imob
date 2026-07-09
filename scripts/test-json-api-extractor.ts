import { extractFromJsonApi } from "../packages/scraper/core/json-api-extractor.js";
import type { JsonApiSiteConfig } from "../packages/scraper/ai/site-config-schema.js";

// site_config json_api validado automaticamente pelo json-api-detector.ts
// contra sentineliesobral.com.br (1.409 imóveis no catálogo). Roda a
// extração completa (sem limite de páginas) para confirmar, com o
// retry/backoff corrigido, quantos imóveis são capturados de fato.
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

console.time("extractFromJsonApi");
const result = await extractFromJsonApi(config);
console.timeEnd("extractFromJsonApi");

console.log(`Páginas buscadas: ${result.pagesFetched}`);
console.log(`Imóveis extraídos: ${result.properties.length}`);
console.log(`Itens pulados (campo faltando): ${result.itemsSkippedMissingField}`);
console.log(`Parou cedo por erro de rede: ${result.stoppedEarlyDueToError}`);

const comValor = result.properties.filter((p) => p.price_status === "valor").length;
const semValor = result.properties.filter((p) => p.price_status === "sob_consulta").length;
console.log(`Com preço: ${comValor} | Sob consulta: ${semValor}`);

const uniqueIds = new Set(result.properties.map((p) => p.external_id));
console.log(`IDs únicos: ${uniqueIds.size} (${uniqueIds.size !== result.properties.length ? "HÁ DUPLICATAS" : "sem duplicatas"})`);
