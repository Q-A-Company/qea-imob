import { extractFromJsonApi } from "../packages/scraper/core/json-api-extractor.js";
import type { JsonApiSiteConfig } from "../packages/scraper/ai/site-config-schema.js";

// site_config json_api escrito à mão a partir do payload capturado via
// DevTools (POST /api/service/consult) — validado sem cookie, sem
// autenticação, paginação por offset confirmada empiricamente (start=0 vs
// start=12 retornam idtProperty diferentes), URL curta /imovel/{id}
// confirmada via redirect 301 pra URL canônica completa.
const config: JsonApiSiteConfig = {
  strategy: "json_api",
  http_method: "POST",
  endpoint_url: "https://imobiliariaveleiros.com.br/api/service/consult",
  // {page} fica sem aspas de propósito — é substituído por um número
  // (o valor de start), não por uma string.
  request_body_template:
    '{"start":{page},"numRows":12,"type":"S","place":null,"sortList":["moreRecentsSales"],' +
    '"idtCityList":[],"idtDistrictList":[],"idtCondominiumList":[],"idtsCampaigns":[],' +
    '"idtsCategories":[],"idtsSubCategories":[],"fromPrice":null,"toPrice":null,"minArea":null,' +
    '"maxArea":null,"rooms":null,"bathrooms":null,"garages":null,"namStreet":null}',
  starting_page: 0,
  page_increment: 12,
  items_field: "response.docs",
  total_field: "response.numFound",
  external_id_field: "idtProperty",
  price_field: "valSales",
  price_unavailable_field: null,
  property_url_field: "idtProperty",
  property_url_base: "https://imobiliariaveleiros.com.br/imovel/",
  property_url_suffix_field: null,
  confidence_score: 0.9,
  warnings: [
    "price_unavailable_field não identificado — 'flgHideValSaleSite' pode ser esse indicador, mas não foi validado; hoje qualquer item sem valSales numérico cai em sob_consulta.",
  ],
};

console.log("request_body_template final:", config.request_body_template);

console.time("extractFromJsonApi:veleiros");
const result = await extractFromJsonApi(config);
console.timeEnd("extractFromJsonApi:veleiros");

console.log(`Páginas buscadas: ${result.pagesFetched}`);
console.log(`Imóveis extraídos: ${result.properties.length}`);
console.log(`Itens pulados (campo faltando): ${result.itemsSkippedMissingField}`);
console.log(`Parou cedo por erro de rede: ${result.stoppedEarlyDueToError}`);
console.log(`Total real declarado por você: 335`);
console.log(`Cobertura: ${((result.properties.length / 335) * 100).toFixed(1)}%`);

const uniqueIds = new Set(result.properties.map((p) => p.external_id));
console.log(`IDs únicos: ${uniqueIds.size} (${uniqueIds.size !== result.properties.length ? "HÁ DUPLICATAS" : "sem duplicatas"})`);

console.log("\nPrimeiros 3:");
console.log(JSON.stringify(result.properties.slice(0, 3), null, 2));
