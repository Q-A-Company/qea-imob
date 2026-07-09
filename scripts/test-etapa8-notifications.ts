import { createServiceClient } from "../packages/scraper/core/db.js";
import { createNotification } from "../packages/scraper/core/notify.js";
import { checkCompetitor } from "../packages/scraper/jobs/check-competitor.js";

const DEMO_ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";
const MULLER_COMPETITOR_ID = "3bb75826-1aee-461a-bd7b-3110cc8a8fd6";
const supabase = createServiceClient();

console.log("=== Cenário 1: site_enabled = false suprime a notificação ===");
await supabase.from("notification_settings").update({ site_enabled: false }).eq("account_id", DEMO_ACCOUNT_ID);
const created1 = await createNotification(supabase, { accountId: DEMO_ACCOUNT_ID, title: "Teste suprimido", message: "não deveria existir" });
console.log("createNotification retornou:", created1, created1 === false ? "✅" : "❌");
const { data: suppressed } = await supabase.from("notifications").select("id").eq("title", "Teste suprimido");
console.log("linhas gravadas com esse título:", suppressed?.length, suppressed?.length === 0 ? "✅ nada foi inserido" : "❌");

console.log("\n=== Restaurando site_enabled = true ===");
await supabase.from("notification_settings").update({ site_enabled: true }).eq("account_id", DEMO_ACCOUNT_ID);
const created2 = await createNotification(supabase, { accountId: DEMO_ACCOUNT_ID, title: "Teste permitido", message: "deveria existir" });
console.log("createNotification retornou:", created2, created2 === true ? "✅" : "❌");
const { data: allowed } = await supabase.from("notifications").select("id").eq("title", "Teste permitido");
console.log("linhas gravadas:", allowed?.length, allowed?.length === 1 ? "✅" : "❌");
if (allowed?.[0]) await supabase.from("notifications").delete().eq("id", allowed[0].id);

console.log("\n=== Cenário 2: mudança de preço real no Muller gera notificação vinculada ===");
const { data: properties } = await supabase
  .from("properties")
  .select("id, external_id, current_price")
  .eq("competitor_id", MULLER_COMPETITOR_ID)
  .limit(1);
if (!properties?.[0]) throw new Error("Nenhuma property encontrada para o Muller — rode seed-demo-competitor.ts primeiro.");

const target = properties[0];
const fakeOldPrice = 1;
console.log(`Alterando current_price de ${target.external_id} para R$ ${fakeOldPrice} (propositalmente errado)...`);
await supabase.from("properties").update({ current_price: fakeOldPrice }).eq("id", target.id);

const result = await checkCompetitor(MULLER_COMPETITOR_ID);
console.log({ changesDetected: result.changesDetected });

const { data: latestNotif } = await supabase
  .from("notifications")
  .select("title, message, property_change_id, read")
  .eq("account_id", DEMO_ACCOUNT_ID)
  .order("created_at", { ascending: false })
  .limit(1);
console.log("Notificação mais recente:", JSON.stringify(latestNotif?.[0], null, 2));
console.log(
  latestNotif?.[0]?.property_change_id ? "✅ property_change_id preenchido" : "❌ property_change_id ausente",
  latestNotif?.[0]?.message?.includes(target.external_id) ? "✅ menciona o external_id certo" : "❌"
);
