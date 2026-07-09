import { checkExternalIdSanity, checkExternalIdCompatibility } from "../packages/scraper/ai/site-config-compatibility.js";
import type { HtmlCssSiteConfig } from "../packages/scraper/ai/site-config-schema.js";

// Reproduz exatamente o bug real observado: external_id e price apontando
// pro mesmo seletor de texto livre (título do card, que inclui o preço).
const badConfig: HtmlCssSiteConfig = {
  strategy: "html_css",
  card_selector: ".th-search",
  external_id: { selector: "h4.search-grid-title a", attribute: "text", data_attribute: null },
  price: { selector: "h4.search-grid-title a", attribute: "text", data_attribute: null, sob_consulta_markers: ["SOB CONSULTA"] },
  property_url: { selector: "h4.search-grid-title a", attribute: "href", data_attribute: null },
  pagination: { type: "none", param_name: null, next_link_selector: null },
  total_listings_hint: 200,
  confidence_score: 0.8,
  warnings: [],
};

const goodConfig: HtmlCssSiteConfig = {
  ...badConfig,
  external_id: { selector: "h4.search-grid-title a", attribute: "href", data_attribute: null },
};

console.log("=== Config ruim (external_id == price, mesmo seletor+atributo texto) ===");
const badResult = checkExternalIdSanity(badConfig);
console.log(JSON.stringify(badResult, null, 2));
console.log(badResult.compatible === false ? "✅ Sanity check REJEITOU corretamente" : "❌ FALHOU EM DETECTAR");

console.log("\n=== Config boa (external_id via href, price via texto) ===");
const goodResult = checkExternalIdSanity(goodConfig);
console.log(JSON.stringify(goodResult, null, 2));
console.log(goodResult.compatible === true ? "✅ Sanity check aprovou corretamente" : "❌ FALSO POSITIVO");

console.log("\n=== Compatibilidade: config anterior (href) vs nova (text, ruim) ===");
const compat = checkExternalIdCompatibility({ previous: goodConfig, next: badConfig });
console.log(JSON.stringify(compat, null, 2));
console.log(compat.compatible === false ? "✅ Mudança estrutural detectada corretamente" : "❌ FALHOU EM DETECTAR MUDANÇA");

// Regressão do falso positivo encontrado em 2026-07-10 (mullerimoveis.com.br,
// fora de teste automatizado): external_id e price são campos de texto
// GENUINAMENTE distintos, seletores irmãos que não se sobrepõem no DOM.
const falsePositiveConfig: HtmlCssSiteConfig = {
  ...badConfig,
  card_selector: "div.imovelcard[data-link]",
  external_id: { selector: ".imovelcard__info__ref strong", attribute: "text", data_attribute: null },
  price: { selector: ".imovelcard__valor__valor", attribute: "text", data_attribute: null, sob_consulta_markers: [] },
};

console.log("\n=== Config real (Muller Imóveis): seletores de texto distintos e não sobrepostos ===");
const fpResult = checkExternalIdSanity(falsePositiveConfig);
console.log(JSON.stringify(fpResult, null, 2));
console.log(fpResult.compatible === true ? "✅ Aprovado corretamente (não é mais falso positivo)" : "❌ FALSO POSITIVO AINDA PRESENTE");

// external_id e price são campos de texto distintos, mas price está
// ANINHADO dentro do seletor de external_id — .text() do ancestral inclui
// o preço. Deve continuar sendo rejeitado.
const nestedConfig: HtmlCssSiteConfig = {
  ...badConfig,
  external_id: { selector: ".card-title", attribute: "text", data_attribute: null },
  price: { selector: ".card-title .price", attribute: "text", data_attribute: null, sob_consulta_markers: [] },
};

console.log("\n=== Config com sobreposição estrutural real (price aninhado em external_id) ===");
const nestedResult = checkExternalIdSanity(nestedConfig);
console.log(JSON.stringify(nestedResult, null, 2));
console.log(nestedResult.compatible === false ? "✅ Sobreposição estrutural detectada corretamente" : "❌ FALHOU EM DETECTAR SOBREPOSIÇÃO");
