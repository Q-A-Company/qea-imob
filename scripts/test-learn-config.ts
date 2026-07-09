import { learnSiteConfig } from "../packages/scraper/jobs/learn-site-config.js";

const url = process.argv[2];
if (!url) {
  console.error("Uso: node --env-file=apps/web/.env.local --import tsx scripts/test-learn-config.ts <url>");
  process.exit(1);
}

console.time("learnSiteConfig");
const result = await learnSiteConfig(url);
console.timeEnd("learnSiteConfig");

console.log(
  `\n=== detecção de json_api: ${result.jsonApiDetection}${result.jsonApiStoppedEarlyDueToError ? " (parou cedo por erro de rede)" : ""} ===`
);
console.log(`=== external_id sanity check: ${result.externalIdSanityOk ? "OK" : "FALHOU (ver warnings)"} ===`);

console.log("\n=== site_config gerado ===");
console.log(JSON.stringify(result.selectors, null, 2));

console.log("\n=== estatísticas ===");
console.log(JSON.stringify(result.stats, null, 2));

console.log("\n=== uso da API (tokens) ===");
console.log(JSON.stringify(result.usage, null, 2));

console.log(`\n=== prévia (${result.preview.length} de ${result.stats.cardsFound} cards) ===`);
console.log(JSON.stringify(result.preview, null, 2));
