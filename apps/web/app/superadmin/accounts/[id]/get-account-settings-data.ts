import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface AccountSettingsData {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  internalNotes: string | null;
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
    .select("id, name, active, created_at, internal_notes")
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

  const { data: competitorIdsRows } = await supabase.from("competitors").select("id").eq("account_id", accountId);
  const competitorIds = (competitorIdsRows ?? []).map((c) => c.id);

  let pendingReviewCount = 0;
  if (competitorIds.length > 0) {
    const { count, error: pendingError } = await supabase
      .from("site_configs")
      .select("id", { count: "exact", head: true })
      .in("competitor_id", competitorIds)
      .eq("status", "pendente_revisao");
    if (pendingError) throw new Error(`Falha ao buscar configs pendentes: ${pendingError.message}`);
    pendingReviewCount = count ?? 0;
  }

  return {
    id: account.id,
    name: account.name,
    active: account.active,
    createdAt: account.created_at,
    internalNotes: account.internal_notes,
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
