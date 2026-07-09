import { learnSiteConfig } from "../packages/scraper/jobs/learn-site-config.js";
import { createServiceClient } from "../packages/scraper/core/db.js";

// Semeia um concorrente permanente (não "de teste") na conta demo, para
// testar o botão "Verificar agora" pela UI. Diferente dos scripts
// test-etapa5-*, este NÃO tem "teste" no nome — cleanup-test-competitors.mjs
// filtra por esse termo, então este registro sobrevive à limpeza.
//
// Uso: node --env-file=apps/web/.env.local --import tsx scripts/seed-demo-competitor.ts

const DEMO_ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";
const url = "https://www.mullerimoveis.com.br/imovel/venda";

const supabase = createServiceClient();

console.log("=== Passo 1: aprender o site_config (Etapa 3, com IA) ===");
const learned = await learnSiteConfig(url);
console.log(`strategy=${learned.selectors.strategy}, cardsFound=${learned.stats.cardsFound}, confidence=${learned.selectors.confidence_score}`);

console.log("\n=== Passo 2: seed do competitor + site_config na conta demo ===");
const { data: competitor, error: competitorError } = await supabase
  .from("competitors")
  .insert({
    account_id: DEMO_ACCOUNT_ID,
    name: "Muller Imóveis",
    abbreviation: "MUL",
    listing_url: url,
    polling_interval_minutes: 5,
    status: "ativo",
  })
  .select("id")
  .single();

if (competitorError || !competitor) throw new Error(`Falha ao criar competitor: ${competitorError?.message}`);
console.log("competitor_id:", competitor.id);

const { error: siteConfigError } = await supabase.from("site_configs").insert({
  competitor_id: competitor.id,
  selectors: learned.selectors,
  version: 1,
  confidence_score: learned.selectors.confidence_score,
  status: "ativo",
  last_validated_at: new Date().toISOString(),
});
if (siteConfigError) throw new Error(`Falha ao criar site_config: ${siteConfigError.message}`);

console.log("\nPronto — concorrente 'Muller Imóveis' visível em /admin/competitors para a conta demo.");
