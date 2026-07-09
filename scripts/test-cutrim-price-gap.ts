import * as cheerio from "cheerio";
import { fetchListingHtml } from "../packages/scraper/core/fetch-html.js";
import { generateSiteConfig } from "../packages/scraper/ai/config-generator.js";
import { extractFromHtml } from "../packages/scraper/core/html-extractor.js";

const url = "https://cutrimimobiliaria.com.br/?s=&bairro=&tipo_de_imovel=&condominio=";

const { html } = await fetchListingHtml(url);
const generated = await generateSiteConfig({ html, listingUrl: url });
const result = extractFromHtml(html, generated.selectors, url);

console.log("site_config gerado nesta chamada:");
console.log(JSON.stringify(generated.selectors, null, 2));

console.log(`\nCards encontrados: ${result.cardsFound}`);
console.log(`Cards sem external_id: ${result.cardsWithoutExternalId}`);
console.log(`Cards SEM preço no card (campo vazio, não é marcador 'Sob Consulta'): ${result.cardsWithoutPrice}`);

const comValor = result.properties.filter((p) => p.price_status === "valor").length;
const semValor = result.properties.length - comValor;
console.log(`Com preço numérico: ${comValor}`);
console.log(`price_status = sob_consulta: ${semValor}`);

// Pega o texto bruto do campo de preço direto do HTML (bypass da
// transformação final) pra cada card, e cruza com o resultado, pra separar
// "marcador genuíno de Sob Consulta" de "falha ao converter texto em número".
const $ = cheerio.load(html);
const cards = $(generated.selectors.card_selector);
const rawPriceByUrl = new Map<string, string>();
cards.each((_, el) => {
  const $card = $(el);
  const priceSel = generated.selectors.price.selector;
  const urlSel = generated.selectors.property_url.selector;
  const rawPrice = ($card.find(priceSel).first().text() || "").trim();
  const rawUrl = $card.find(urlSel).first().attr("href") || "";
  if (rawUrl) rawPriceByUrl.set(new URL(rawUrl, url).toString(), rawPrice);
});

const semPreco = result.properties.filter((p) => p.price === null);
let comMarcador = 0;
let semMarcador = 0;
const semMarcadorExemplos: { url: string; rawPrice: string }[] = [];
for (const prop of semPreco) {
  const rawPrice = rawPriceByUrl.get(prop.url) ?? "";
  if (/sob consulta/i.test(rawPrice)) {
    comMarcador++;
  } else {
    semMarcador++;
    semMarcadorExemplos.push({ url: prop.url, rawPrice });
  }
}

console.log(
  `\nDos ${semPreco.length} sem preço numérico: ${comMarcador} têm o texto bruto "SOB CONSULTA" no card (marcador genuíno); ${semMarcador} NÃO têm esse texto (falha de parsing do valor real, não ausência genuína).`
);
console.log("\nExemplos sem marcador (texto bruto do campo de preço extraído do card):");
console.log(JSON.stringify(semMarcadorExemplos, null, 2));
