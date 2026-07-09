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
