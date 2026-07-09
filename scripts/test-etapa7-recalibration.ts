import { createServiceClient } from "../packages/scraper/core/db.js";
import { checkCompetitor } from "../packages/scraper/jobs/check-competitor.js";
import { recalibrateSiteConfig } from "../packages/scraper/jobs/recalibrate-site-config.js";
import type { HtmlCssSiteConfig } from "../packages/scraper/ai/site-config-schema.js";

const DEMO_ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";
const REAL_URL = "https://www.mullerimoveis.com.br/imovel/venda";
const supabase = createServiceClient();

function dummyConfig(overrides: Partial<HtmlCssSiteConfig>): HtmlCssSiteConfig {
  return {
    strategy: "html_css",
    card_selector: ".card",
    external_id: { selector: ".ref", attribute: "text", data_attribute: null },
    price: { selector: ".price", attribute: "text", data_attribute: null, sob_consulta_markers: [] },
    property_url: { selector: "a", attribute: "href", data_attribute: null },
    pagination: { type: "none", param_name: null, next_link_selector: null },
    total_listings_hint: null,
    confidence_score: 0.5,
    warnings: [],
    ...overrides,
  };
}

async function makeCompetitor(name: string, selectors: HtmlCssSiteConfig) {
  const { data: competitor, error } = await supabase
    .from("competitors")
    .insert({ account_id: DEMO_ACCOUNT_ID, name, abbreviation: "TST", listing_url: REAL_URL, polling_interval_minutes: 5, status: "ativo" })
    .select("id")
    .single();
  if (error || !competitor) throw new Error(`Falha ao criar competitor: ${error?.message}`);

  const { error: siteConfigError } = await supabase
    .from("site_configs")
    .insert({ competitor_id: competitor.id, selectors, version: 1, confidence_score: selectors.confidence_score, status: "ativo" });
  if (siteConfigError) throw new Error(`Falha ao criar site_config: ${siteConfigError.message}`);

  return competitor.id;
}

console.log("=== Cenário 1: gatilho de degradação via checkCompetitor (card_selector quebrado de propósito) ===");
const brokenCompetitorId = await makeCompetitor(
  "Teste Etapa 7 (gatilho degradação)",
  dummyConfig({ card_selector: ".este-seletor-nao-existe-em-lugar-nenhum" })
);
const checkResult = await checkCompetitor(brokenCompetitorId);
console.log({
  propertiesCaptured: checkResult.propertiesCaptured,
  stoppedEarlyDueToError: checkResult.stoppedEarlyDueToError,
  configMarkedDegraded: checkResult.configMarkedDegraded,
});
console.log(
  checkResult.propertiesCaptured === 0 && checkResult.stoppedEarlyDueToError === false && checkResult.configMarkedDegraded === true
    ? "✅ Gatilho de degradação disparou corretamente"
    : "❌ FALHOU"
);
const { data: degradedRow } = await supabase.from("site_configs").select("status").eq("competitor_id", brokenCompetitorId).single();
console.log("status do site_config:", degradedRow?.status, degradedRow?.status === "degradado" ? "✅" : "❌");
const { data: degradedNotif } = await supabase
  .from("notifications")
  .select("title")
  .eq("account_id", DEMO_ACCOUNT_ID)
  .order("created_at", { ascending: false })
  .limit(1);
console.log("notificação:", degradedNotif?.[0]?.title);

console.log("\n=== Cenário 2: recalibração com config anterior COMPATÍVEL (mesmo attribute 'text') — deve ativar sozinho ===");
const compatibleCompetitorId = await makeCompetitor(
  "Teste Etapa 7 (recalibração compatível)",
  dummyConfig({ external_id: { selector: ".ref-generico", attribute: "text", data_attribute: null } })
);
const recalA = await recalibrateSiteConfig(compatibleCompetitorId);
console.log({ activated: recalA.activated, newVersion: recalA.newVersion, reasons: recalA.reasons });
console.log(recalA.activated === true ? "✅ Ativou automaticamente (compatível)" : "❌ Esperava ativação automática");
const { data: siteConfigsA } = await supabase
  .from("site_configs")
  .select("version, status")
  .eq("competitor_id", compatibleCompetitorId)
  .order("version");
console.log(siteConfigsA);

console.log("\n=== Cenário 3: recalibração com config anterior INCOMPATÍVEL (attribute 'href' forçado) — deve exigir revisão ===");
const incompatibleCompetitorId = await makeCompetitor(
  "Teste Etapa 7 (recalibração incompatível)",
  dummyConfig({ external_id: { selector: ".ref-generico", attribute: "href", data_attribute: null } })
);
const recalB = await recalibrateSiteConfig(incompatibleCompetitorId);
console.log({ activated: recalB.activated, newVersion: recalB.newVersion, reasons: recalB.reasons });
console.log(recalB.activated === false ? "✅ NÃO ativou sozinho (incompatível) — pendente_revisao" : "❌ Esperava pendente_revisao");
const { data: siteConfigsB } = await supabase
  .from("site_configs")
  .select("version, status")
  .eq("competitor_id", incompatibleCompetitorId)
  .order("version");
console.log(siteConfigsB);
const { data: activeAfterB } = await supabase
  .from("site_configs")
  .select("id")
  .eq("competitor_id", incompatibleCompetitorId)
  .eq("status", "ativo")
  .maybeSingle();
console.log(
  "Nenhum site_config 'ativo' restante (correto — precisa de aprovação humana):",
  activeAfterB === null ? "✅" : "❌ ainda existe um 'ativo'"
);

console.log("\n=== Limpeza ===");
await supabase.from("competitors").delete().in("id", [brokenCompetitorId, compatibleCompetitorId, incompatibleCompetitorId]);
console.log("Removidos (cascade apaga site_configs/scraper_runs/properties).");
