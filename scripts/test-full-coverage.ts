import { fetchListingHtml } from "../packages/scraper/core/fetch-html.js";
import { generateSiteConfig } from "../packages/scraper/ai/config-generator.js";
import { extractAllPagesFromHtml } from "../packages/scraper/core/html-paginator.js";

const sites = [
  { url: "https://www.mullerimoveis.com.br/imovel/venda", realTotal: 61, name: "mullerimoveis" },
  { url: "https://mullerimoveisrj.com.br/negociacao/comprar/", realTotal: 1077, name: "mullerimoveisrj" },
];

for (const site of sites) {
  console.log(`\n\n########## ${site.name} (total real declarado: ${site.realTotal}) ##########`);

  const { html } = await fetchListingHtml(site.url);
  const generated = await generateSiteConfig({ html, listingUrl: site.url });
  console.log("Paginação detectada pela IA:", JSON.stringify(generated.selectors.pagination));
  console.log("total_listings_hint (o que o site declara na própria página):", generated.selectors.total_listings_hint);

  console.time(`extractAllPagesFromHtml:${site.name}`);
  const result = await extractAllPagesFromHtml({
    firstPageUrl: site.url,
    firstPageHtml: html,
    config: generated.selectors,
  });
  console.timeEnd(`extractAllPagesFromHtml:${site.name}`);

  console.log(`Páginas percorridas: ${result.pagesFetched}`);
  console.log(`Motivo de parada: ${result.stoppedReason}`);
  console.log(`Imóveis capturados (únicos): ${result.properties.length}`);
  console.log(`Total real declarado por você: ${site.realTotal}`);
  console.log(
    `Cobertura: ${((result.properties.length / site.realTotal) * 100).toFixed(1)}% (${result.properties.length}/${site.realTotal})`
  );
  console.log(`Duplicatas detectadas (external_id repetido entre páginas): ${result.duplicateExternalIds.length}`);
  if (result.duplicateExternalIds.length > 0) {
    console.log("  IDs duplicados:", result.duplicateExternalIds.slice(0, 20));
  }
  console.log(`Cards sem external_id: ${result.cardsWithoutExternalId}`);
  console.log(
    `Cards SEM preço no card (não é 'Sob Consulta' — o campo veio vazio, preço provavelmente só na página de detalhe): ${result.cardsWithoutPrice}`
  );

  const comValor = result.properties.filter((p) => p.price_status === "valor").length;
  const semValorSobConsulta = result.properties.length - comValor - result.cardsWithoutPrice;
  console.log(`Com preço numérico capturado: ${comValor}`);
  console.log(`Sob consulta (marcador genuíno, ex: texto "Sob Consulta"): ${semValorSobConsulta >= 0 ? semValorSobConsulta : "n/d"}`);

  const uniqueCheck = new Set(result.properties.map((p) => p.external_id));
  console.log(`Verificação final de unicidade: ${uniqueCheck.size} IDs únicos em ${result.properties.length} propriedades (${uniqueCheck.size === result.properties.length ? "OK, sem duplicata" : "ATENÇÃO: HÁ DUPLICATA"})`);
}
