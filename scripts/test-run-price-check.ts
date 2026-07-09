import { learnSiteConfig } from "../packages/scraper/jobs/learn-site-config.js";
import { runPriceCheck } from "../packages/scraper/jobs/run-price-check.js";

const url = "https://www.mullerimoveis.com.br/imovel/venda";

console.log("=== Passo 1 (Etapa 3, com IA): aprender o site_config uma vez ===");
const learned = await learnSiteConfig(url);
console.log(`Config aprendido, strategy=${learned.selectors.strategy}, tokens usados=${learned.usage.inputTokens + learned.usage.outputTokens}`);

console.log("\n=== Passo 2 (Etapa 4, SEM IA): rodar checagem de rotina usando o config salvo ===");
console.time("runPriceCheck");
const result = await runPriceCheck({ listingUrl: url, config: learned.selectors });
console.timeEnd("runPriceCheck");

console.log(`Páginas percorridas: ${result.pagesFetched}`);
console.log(`Imóveis capturados: ${result.properties.length}`);
console.log(`Duplicatas: ${result.duplicateExternalIds.length}`);
console.log(`Sem preço no card: ${result.cardsWithoutPrice}`);
console.log(`Sem external_id: ${result.cardsWithoutExternalId}`);
console.log(`Parou cedo por erro: ${result.stoppedEarlyDueToError}`);
console.log(`Total real conhecido: 61 | Cobertura: ${((result.properties.length / 61) * 100).toFixed(1)}%`);
