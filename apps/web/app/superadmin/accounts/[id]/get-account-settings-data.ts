import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPendingSiteConfigCount } from "./get-pending-site-configs";

export interface AccountSettingsData {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  internalNotes: string | null;
  maxCompetitors: number | null;
  competitorsCount: number;
  usersCount: number;
  pendingReviewCount: number;
  notificationSettings: {
    siteEnabled: boolean;
    emailEnabled: boolean;
    whatsappEnabled: boolean;
  } | null;
}

// notification_settings aqui é somente leitura — decisão confirmada com o
// usuário: editar de verdade é gestão do próprio Admin da conta, nasce
// quando a Etapa de Configurações do Admin for pedida (/admin/settings
// ainda é placeholder hoje). Aqui é só "esse canal está ligado?" pra
// diagnóstico.
export async function getAccountSettingsData(accountId: string): Promise<AccountSettingsData | null> {
  const supabase = await createClient();

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id, name, active, created_at, internal_notes, max_competitors")
    .eq("id", accountId)
    .maybeSingle();
  if (accountError) throw new Error(`Falha ao buscar conta: ${accountError.message}`);
  if (!account) return null;

  const [
    { count: competitorsCount, error: competitorsError },
    { count: usersCount, error: usersError },
    { data: notificationSettings, error: notificationError },
  ] = await Promise.all([
    supabase.from("competitors").select("id", { count: "exact", head: true }).eq("account_id", accountId),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("account_id", accountId),
    supabase.from("notification_settings").select("site_enabled, email_enabled, whatsapp_enabled").eq("account_id", accountId).maybeSingle(),
  ]);
  if (competitorsError) throw new Error(`Falha ao contar concorrentes: ${competitorsError.message}`);
  if (usersError) throw new Error(`Falha ao contar usuários: ${usersError.message}`);
  if (notificationError) throw new Error(`Falha ao buscar notification_settings: ${notificationError.message}`);

  const pendingReviewCount = await getPendingSiteConfigCount(accountId);

  return {
    id: account.id,
    name: account.name,
    active: account.active,
    createdAt: account.created_at,
    internalNotes: account.internal_notes,
    maxCompetitors: account.max_competitors,
    competitorsCount: competitorsCount ?? 0,
    usersCount: usersCount ?? 0,
    pendingReviewCount,
    notificationSettings: notificationSettings
      ? {
          siteEnabled: notificationSettings.site_enabled,
          emailEnabled: notificationSettings.email_enabled,
          whatsappEnabled: notificationSettings.whatsapp_enabled,
        }
      : null,
  };
}
