import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface AccountNotificationSettings {
  siteEnabled: boolean;
  emailEnabled: boolean;
}

export async function getNotificationSettings(accountId: string): Promise<AccountNotificationSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_settings")
    .select("site_enabled, email_enabled")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar configurações de notificação: ${error.message}`);

  // Defaults iguais aos da coluna, mesmo raciocínio já usado em
  // core/notify.ts — não deveria acontecer em uso normal (toda conta
  // ganha uma linha em notification_settings junto com o cadastro), mas
  // defensivo caso não exista ainda.
  return {
    siteEnabled: data?.site_enabled ?? true,
    emailEnabled: data?.email_enabled ?? false,
  };
}
