import { createServiceClient } from "../packages/scraper/core/db.js";
import { checkCompetitor } from "../packages/scraper/jobs/check-competitor.js";
import type { HtmlCssSiteConfig } from "../packages/scraper/ai/site-config-schema.js";

const DEMO_ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";
const BROKEN_URL = "https://este-dominio-nao-existe-qea-teste-12345.com.br/venda";

const supabase = createServiceClient();

const fakeConfig: HtmlCssSiteConfig = {
  strategy: "html_css",
  card_selector: ".card",
  external_id: { selector: ".id", attribute: "text", data_attribute: null },
  price: { selector: ".price", attribute: "text", data_attribute: null, sob_consulta_markers: [] },
  property_url: { selector: "a", attribute: "href", data_attribute: null },
  pagination: { type: "none", param_name: null, next_link_selector: null },
  total_listings_hint: null,
  confidence_score: 0.5,
  warnings: [],
};

console.log("=== Seed: competitor com URL inacessível de propósito ===");
const { data: competitor, error } = await supabase
  .from("competitors")
  .insert({
    account_id: DEMO_ACCOUNT_ID,
    name: "Teste Circuit Breaker (URL quebrada de propósito)",
    listing_url: BROKEN_URL,
    polling_interval_minutes: 5,
    status: "ativo",
  })
  .select("id")
  .single();
if (error || !competitor) throw new Error(`Falha ao criar competitor: ${error?.message}`);

await supabase.from("site_configs").insert({
  competitor_id: competitor.id,
  selectors: fakeConfig,
  version: 1,
  confidence_score: 0.5,
  status: "ativo",
});

console.log("competitor_id:", competitor.id);

for (let i = 1; i <= 3; i++) {
  console.log(`\n=== Tentativa ${i}/3 ===`);
  const result = await checkCompetitor(competitor.id);
  console.log({
    success: result.success,
    stoppedEarlyDueToError: result.stoppedEarlyDueToError,
    pausedByCircuitBreaker: result.pausedByCircuitBreaker,
    errorMessage: result.errorMessage,
  });
}

console.log("\n=== Status final do competitor ===");
const { data: finalCompetitor } = await supabase.from("competitors").select("status").eq("id", competitor.id).single();
console.log("status:", finalCompetitor?.status, finalCompetitor?.status === "pausado" ? "✅ PAUSADO CORRETAMENTE" : "❌ NÃO PAUSOU");

console.log("\n=== Notificação criada? ===");
const { data: notifications } = await supabase
  .from("notifications")
  .select("title, message")
  .eq("account_id", DEMO_ACCOUNT_ID)
  .order("created_at", { ascending: false })
  .limit(1);
console.log(JSON.stringify(notifications?.[0], null, 2));

console.log("\n=== Teste de reativação: corrige a URL e roda de novo ===");
await supabase.from("competitors").update({ listing_url: "https://www.mullerimoveis.com.br/imovel/venda" }).eq("id", competitor.id);
// troca também pra uma config válida (a fake não bateria com o HTML real)
const { data: workingSiteConfig } = await supabase
  .from("site_configs")
  .select("selectors")
  .eq("status", "ativo")
  .neq("competitor_id", competitor.id)
  .limit(1)
  .maybeSingle();
if (workingSiteConfig) {
  await supabase.from("site_configs").update({ selectors: workingSiteConfig.selectors }).eq("competitor_id", competitor.id);
}

const recoveryResult = await checkCompetitor(competitor.id);
console.log({
  success: recoveryResult.success,
  stoppedEarlyDueToError: recoveryResult.stoppedEarlyDueToError,
  reactivatedAfterSuccess: recoveryResult.reactivatedAfterSuccess,
  propertiesCaptured: recoveryResult.propertiesCaptured,
});

const { data: reactivatedCompetitor } = await supabase.from("competitors").select("status").eq("id", competitor.id).single();
console.log("status final:", reactivatedCompetitor?.status, reactivatedCompetitor?.status === "ativo" ? "✅ REATIVADO CORRETAMENTE" : "❌ NÃO REATIVOU");

console.log("\n=== Limpeza: removendo o competitor de teste ===");
await supabase.from("competitors").delete().eq("id", competitor.id);
console.log("Removido.");
