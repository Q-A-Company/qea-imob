import type { SupabaseClient } from "@supabase/supabase-js";

export interface NotifyParams {
  accountId: string;
  title: string;
  message: string;
  propertyChangeId?: string;
}

export interface NotifyResult {
  siteCreated: boolean;
}

// Ponto único de criação de notificação do sino — Etapa 8. Antes disso,
// check-competitor.ts e recalibrate-site-config.ts inseriam direto em
// `notifications`, sem checar preferência da conta. Centralizado aqui pra
// esse comportamento ser consistente em todo lugar que notifica.
//
// E-mail NÃO dispara mais aqui (mudança deliberada — decisão do usuário):
// até a Etapa 9 original, email_enabled disparava um e-mail por mudança
// individual; agora email_enabled só alimenta o resumo diário agregado
// (packages/scraper/jobs/send-daily-digest.ts). O sino continua
// instantâneo, por mudança, sem nenhuma alteração de comportamento — é
// gratuito (não depende de API externa), diferente de e-mail.
//
// Default quando a conta ainda não tem linha em notification_settings
// (não deveria acontecer em uso normal, mas defensivo): site habilitado,
// mesmo default `true` da coluna.
export async function createNotification(supabase: SupabaseClient, params: NotifyParams): Promise<NotifyResult> {
  const { data: settings } = await supabase
    .from("notification_settings")
    .select("site_enabled")
    .eq("account_id", params.accountId)
    .maybeSingle();

  const siteEnabled = settings?.site_enabled ?? true;

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

  return { siteCreated };
}
