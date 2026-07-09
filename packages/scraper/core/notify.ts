import type { SupabaseClient } from "@supabase/supabase-js";

export interface NotifyParams {
  accountId: string;
  title: string;
  message: string;
  propertyChangeId?: string;
}

// Ponto único de criação de notificação interna (sino) — Etapa 8. Antes
// desta etapa, check-competitor.ts e recalibrate-site-config.ts inseriam
// direto em `notifications`, sem checar a preferência da conta. Centralizado
// aqui pra esse comportamento ser consistente em todo lugar que notifica,
// não só nos novos casos (property_changes).
//
// `notification_settings.site_enabled` tem default `true` na tabela — se a
// conta ainda não tem linha em notification_settings (não deveria acontecer
// em uso normal, mas defensivo), trata como habilitado por padrão.
export async function createNotification(supabase: SupabaseClient, params: NotifyParams): Promise<boolean> {
  const { data: settings } = await supabase
    .from("notification_settings")
    .select("site_enabled")
    .eq("account_id", params.accountId)
    .maybeSingle();

  if (settings?.site_enabled === false) return false;

  const { error } = await supabase.from("notifications").insert({
    account_id: params.accountId,
    property_change_id: params.propertyChangeId ?? null,
    title: params.title,
    message: params.message,
  });
  if (error) throw new Error(`Falha ao criar notificação: ${error.message}`);

  return true;
}
