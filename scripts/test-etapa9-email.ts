import { createServiceClient } from "../packages/scraper/core/db.js";
import { createNotification } from "../packages/scraper/core/notify.js";

const DEMO_ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";
const supabase = createServiceClient();

console.log("=== Estado real de partida: email_enabled da conta demo ===");
const { data: initialSettings } = await supabase
  .from("notification_settings")
  .select("email_enabled")
  .eq("account_id", DEMO_ACCOUNT_ID)
  .single();
console.log("email_enabled:", initialSettings?.email_enabled, initialSettings?.email_enabled === false ? "✅ (default preservado)" : "⚠️");

console.log("\n=== Cenário 1: email_enabled=true, mas RESEND_API_KEY/FROM não configurados (estado real do .env hoje) ===");
delete process.env.RESEND_API_KEY;
delete process.env.RESEND_FROM_EMAIL;
await supabase.from("notification_settings").update({ email_enabled: true }).eq("account_id", DEMO_ACCOUNT_ID);

const result1 = await createNotification(supabase, {
  accountId: DEMO_ACCOUNT_ID,
  title: "Teste Etapa 9 (sem config)",
  message: "não deveria mandar e-mail de verdade",
});
console.log(JSON.stringify(result1, null, 2));
console.log(
  result1.emailSent === false && result1.emailError?.includes("não estão configurados")
    ? "✅ Bloqueado corretamente por falta de configuração, sem derrubar a notificação"
    : "❌ comportamento inesperado"
);
console.log("site notification ainda foi criada:", result1.siteCreated === true ? "✅" : "❌");

console.log("\n=== Cenário 2: com RESEND_API_KEY/FROM presentes (chave FALSA, só pra provar que a chamada de rede acontece) ===");
process.env.RESEND_API_KEY = "re_fake_key_para_provar_integracao_1234567890";
process.env.RESEND_FROM_EMAIL = "onboarding@resend.dev";

const result2 = await createNotification(supabase, {
  accountId: DEMO_ACCOUNT_ID,
  title: "Teste Etapa 9 (chave falsa)",
  message: "deveria tentar mandar e chegar a um erro de autenticação real da API do Resend",
});
console.log(JSON.stringify(result2, null, 2));
console.log(
  result2.emailSent === false && result2.emailError && !result2.emailError.includes("não estão configurados")
    ? "✅ Passou do guard de configuração e chegou numa resposta real da API do Resend (chave inválida, como esperado)"
    : "❌ não chegou a chamar a API de verdade"
);

console.log("\n=== Limpeza: restaurando email_enabled=false (não vamos ativar de verdade agora) ===");
await supabase.from("notification_settings").update({ email_enabled: false }).eq("account_id", DEMO_ACCOUNT_ID);
await supabase.from("notifications").delete().in("title", ["Teste Etapa 9 (sem config)", "Teste Etapa 9 (chave falsa)"]);
const { data: finalSettings } = await supabase
  .from("notification_settings")
  .select("email_enabled")
  .eq("account_id", DEMO_ACCOUNT_ID)
  .single();
console.log("email_enabled restaurado para:", finalSettings?.email_enabled, finalSettings?.email_enabled === false ? "✅" : "❌");
