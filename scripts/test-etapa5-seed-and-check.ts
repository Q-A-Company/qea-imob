import { learnSiteConfig } from "../packages/scraper/jobs/learn-site-config.js";
import { createServiceClient } from "../packages/scraper/core/db.js";
import { getDueCompetitors } from "../packages/scraper/jobs/scheduler.js";
import { checkCompetitor } from "../packages/scraper/jobs/check-competitor.js";

const DEMO_ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";
const url = "https://www.mullerimoveis.com.br/imovel/venda";

const supabase = createServiceClient();

console.log("=== Passo 1: aprender o site_config (Etapa 3, com IA) ===");
const learned = await learnSiteConfig(url);
console.log(`strategy=${learned.selectors.strategy}, cardsFound=${learned.stats.cardsFound}`);

console.log("\n=== Passo 2: seed do competitor + site_config ===");
const { data: competitor, error: competitorError } = await supabase
  .from("competitors")
  .insert({
    account_id: DEMO_ACCOUNT_ID,
    name: "Muller Imóveis (teste Etapa 5)",
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
console.log("site_config criado.");

console.log("\n=== Passo 3: getDueCompetitors() deve incluir este (last_checked_at null) ===");
const due = await getDueCompetitors();
console.log(`Total devidos: ${due.length}`);
console.log("Este competitor está na lista?", due.some((c) => c.id === competitor.id));

console.log("\n=== Passo 4: checkCompetitor() — checagem de rotina, sem IA ===");
console.time("checkCompetitor");
const result = await checkCompetitor(competitor.id);
console.timeEnd("checkCompetitor");
console.log(JSON.stringify({ ...result, properties: `${result.properties.length} imóveis (omitido)` }, null, 2));

console.log("\n=== Passo 5: confirma que scraper_runs foi gravado corretamente ===");
const { data: runs } = await supabase
  .from("scraper_runs")
  .select("*")
  .eq("competitor_id", competitor.id)
  .order("created_at", { ascending: false })
  .limit(1);
console.log(JSON.stringify(runs?.[0], null, 2));

console.log("\n=== Passo 6: confirma que last_checked_at foi atualizado ===");
const { data: updatedCompetitor } = await supabase.from("competitors").select("last_checked_at").eq("id", competitor.id).single();
console.log("last_checked_at:", updatedCompetitor?.last_checked_at);

console.log("\n=== Passo 7: getDueCompetitors() agora NÃO deve incluir (acabou de checar) ===");
const dueAfter = await getDueCompetitors();
console.log("Ainda está na lista de devidos?", dueAfter.some((c) => c.id === competitor.id));

console.log("\ncompetitor_id para os próximos testes (circuit breaker):", competitor.id);
