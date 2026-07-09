import type { SupabaseClient } from "@supabase/supabase-js";

// `profiles` não guarda e-mail (só existe em auth.users, gerenciado pelo
// Supabase Auth) — por isso precisa da API admin (service role) pra
// resolver e-mail a partir de cada profile.id. Mesma audiência do sino
// (Etapa 8): todo membro da conta, Admin e Usuario, não só Admin — os dois
// canais (site, e-mail) notificam o mesmo público, só mudam de entrega.
export async function getAccountRecipientEmails(supabase: SupabaseClient, accountId: string): Promise<string[]> {
  const { data: profiles, error } = await supabase.from("profiles").select("id").eq("account_id", accountId);
  if (error) throw new Error(`Falha ao buscar membros da conta: ${error.message}`);
  if (!profiles || profiles.length === 0) return [];

  const emails = await Promise.all(
    profiles.map(async (profile) => {
      const { data, error: userError } = await supabase.auth.admin.getUserById(profile.id);
      if (userError || !data.user?.email) return null;
      return data.user.email;
    })
  );

  return emails.filter((email): email is string => email !== null);
}
