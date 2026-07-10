"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit/log";

export interface UpdateNotificationChannelState {
  error?: string;
  success?: boolean;
  warning?: string;
}

// accountId nunca é parâmetro — vem sempre do profile de quem está logado
// (mesmo motivo de lib/users/actions.ts), Corretor nunca chega aqui porque
// requireRole já barra antes.
export async function updateNotificationChannelAction(
  channel: "site" | "email",
  enabled: boolean
): Promise<UpdateNotificationChannelState> {
  const profile = await requireRole(["admin", "gerente"]);
  const accountId = profile.account_id!;

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("notification_settings")
    .select("site_enabled, email_enabled")
    .eq("account_id", accountId)
    .maybeSingle();

  const { error } = await supabase.from("notification_settings").upsert(
    {
      account_id: accountId,
      site_enabled: channel === "site" ? enabled : (current?.site_enabled ?? true),
      email_enabled: channel === "email" ? enabled : (current?.email_enabled ?? false),
    },
    { onConflict: "account_id" }
  );
  if (error) return { error: `Falha ao salvar: ${error.message}` };

  await logAuditEvent({
    actorUserId: profile.id,
    accountId,
    actionType: "settings_updated",
    targetType: "notification_settings",
    details: { channel, enabled },
  });
  revalidatePath("/admin/settings");

  // Aviso combinado antes: ligar e-mail sem RESEND_API_KEY/RESEND_FROM_EMAIL
  // configurados não deveria parecer que vai funcionar silenciosamente —
  // o Admin/Gerente não controla essa variável de ambiente (é infra, não
  // preferência de conta), então a ação continua salvando a intenção, só
  // avisa que o envio de verdade ainda não vai sair até isso ser configurado.
  const warning =
    channel === "email" && enabled && (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL)
      ? "E-mail habilitado, mas RESEND_API_KEY/RESEND_FROM_EMAIL ainda não estão configurados no ambiente — o resumo diário não vai sair de verdade até isso ser configurado."
      : undefined;

  return { success: true, warning };
}

export interface UpdatePersonalEmailPreferenceState {
  error?: string;
  success?: boolean;
}

// Nível 2 — preferência PESSOAL, qualquer role (admin/gerente/usuario).
// Self-service: sempre a própria linha (profile.id de quem está logado),
// nunca um id vindo de parâmetro/formulário. A policy self_update_email_preference
// + o grant restrito à coluna (migration 0010) fazem o resto — mesmo se
// alguém adulterasse o id no client, RLS só deixaria a própria linha passar.
export async function updatePersonalEmailPreferenceAction(enabled: boolean): Promise<UpdatePersonalEmailPreferenceState> {
  const profile = await requireRole(["admin", "gerente", "usuario"]);

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ email_notifications_enabled: enabled }).eq("id", profile.id);
  if (error) return { error: `Falha ao salvar: ${error.message}` };

  revalidatePath("/admin/settings");
  revalidatePath("/user/settings");
  return { success: true };
}
