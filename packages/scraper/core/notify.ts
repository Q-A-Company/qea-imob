import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "./send-email.js";
import { getAccountRecipientEmails } from "./get-account-recipients.js";

export interface NotifyParams {
  accountId: string;
  title: string;
  message: string;
  propertyChangeId?: string;
}

export interface NotifyResult {
  siteCreated: boolean;
  emailSent: boolean;
  emailError: string | null;
}

// Ponto único de criação de notificação — Etapa 8 (sino) + Etapa 9
// (e-mail). Antes da Etapa 8, check-competitor.ts e
// recalibrate-site-config.ts inseriam direto em `notifications`, sem
// checar preferência da conta. Centralizado aqui pra esse comportamento
// ser consistente em todo lugar que notifica.
//
// site_enabled e email_enabled são checados de forma INDEPENDENTE — são
// dois canais distintos pro mesmo evento (o schema já modela os dois como
// colunas separadas, mais whatsapp_enabled pra um canal futuro), não um
// dependendo do outro. Uma conta poderia (hipoteticamente) ter e-mail
// ligado e sino desligado.
//
// Defaults quando a conta ainda não tem linha em notification_settings
// (não deveria acontecer em uso normal, mas defensivo): site habilitado
// (mesmo default `true` da coluna), e-mail desabilitado (mesmo default
// `false` da coluna — nunca manda e-mail sem a conta ter optado).
export async function createNotification(supabase: SupabaseClient, params: NotifyParams): Promise<NotifyResult> {
  const { data: settings } = await supabase
    .from("notification_settings")
    .select("site_enabled, email_enabled")
    .eq("account_id", params.accountId)
    .maybeSingle();

  const siteEnabled = settings?.site_enabled ?? true;
  const emailEnabled = settings?.email_enabled ?? false;

  let siteCreated = false;
  if (siteEnabled) {
    const { error } = await supabase.from("notifications").insert({
      account_id: params.accountId,
      property_change_id: params.propertyChangeId ?? null,
      title: params.title,
      message: params.message,
    });
    if (error) throw new Error(`Falha ao criar notificação: ${error.message}`);
    siteCreated = true;
  }

  let emailSent = false;
  let emailError: string | null = null;
  // email_enabled === false (default de toda conta hoje) pula este bloco
  // inteiro — nenhuma chamada de rede, nenhum acesso a RESEND_API_KEY,
  // nada. A função sendEmail() só é referenciada, nunca invocada.
  if (emailEnabled) {
    try {
      const recipients = await getAccountRecipientEmails(supabase, params.accountId);
      if (recipients.length > 0) {
        await sendEmail({ to: recipients, subject: params.title, title: params.title, message: params.message });
        emailSent = true;
      }
    } catch (err) {
      // Falha no canal de e-mail não derruba a notificação principal (o
      // sino já foi gravado acima, se aplicável) — e-mail é um canal
      // secundário, não pode virar ponto único de falha pro fluxo de
      // checagem inteiro (check-competitor.ts) travar por causa disso.
      emailError = err instanceof Error ? err.message : String(err);
    }
  }

  return { siteCreated, emailSent, emailError };
}
