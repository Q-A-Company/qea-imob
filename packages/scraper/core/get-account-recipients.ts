import type { SupabaseClient } from "@supabase/supabase-js";

export interface AccountRecipient {
  email: string;
  role: string;
}

// `profiles` não guarda e-mail (só existe em auth.users, gerenciado pelo
// Supabase Auth) — por isso precisa da API admin (service role) pra
// resolver e-mail a partir de cada profile.id. `role` incluído porque o
// resumo diário (send-daily-digest.ts) precisa saber pra montar o link
// certo do relatório (/admin/relatorios vs /user/relatorios) por
// destinatário. Já filtra por `email_notifications_enabled = true`
// (Nível 2 — preferência pessoal, migration 0010): um membro da conta que
// desligou a própria preferência nunca aparece aqui, mesmo com
// notification_settings.email_enabled=true pra conta inteira.
export async function getAccountRecipients(supabase: SupabaseClient, accountId: string): Promise<AccountRecipient[]> {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("account_id", accountId)
    .eq("email_notifications_enabled", true);
  if (error) throw new Error(`Falha ao buscar membros da conta: ${error.message}`);
  if (!profiles || profiles.length === 0) return [];

  const recipients = await Promise.all(
    profiles.map(async (profile) => {
      const { data, error: userError } = await supabase.auth.admin.getUserById(profile.id);
      if (userError || !data.user?.email) return null;
      return { email: data.user.email, role: profile.role as string };
    })
  );

  return recipients.filter((r): r is AccountRecipient => r !== null);
}
