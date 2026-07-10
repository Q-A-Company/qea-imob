import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { UserRole } from "@/lib/supabase/types";

export interface AccountUser {
  id: string;
  fullName: string | null;
  role: UserRole;
  createdAt: string;
  email: string | null;
  lastSignInAt: string | null;
  banned: boolean;
}

// A API admin do Supabase Auth (getUserById) é o único jeito de resolver
// e-mail/último login/banimento a partir de um profile.id — mesmo padrão já
// usado em packages/scraper/core/get-account-recipients.ts (Etapa 9).
export async function getAccountUsers(accountId: string): Promise<AccountUser[]> {
  const supabase = await createClient();
  const serviceClient = createServiceClient();

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, created_at")
    .eq("account_id", accountId)
    .order("created_at");
  if (error) throw new Error(`Falha ao buscar usuários: ${error.message}`);

  return Promise.all(
    (profiles ?? []).map(async (profile) => {
      const { data, error: authError } = await serviceClient.auth.admin.getUserById(profile.id);
      const authUser = authError ? null : data.user;
      const bannedUntil = authUser?.banned_until ? new Date(authUser.banned_until) : null;
      return {
        id: profile.id,
        fullName: profile.full_name,
        role: profile.role,
        createdAt: profile.created_at,
        email: authUser?.email ?? null,
        lastSignInAt: authUser?.last_sign_in_at ?? null,
        banned: bannedUntil !== null && bannedUntil.getTime() > Date.now(),
      };
    })
  );
}
