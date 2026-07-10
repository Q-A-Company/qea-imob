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
  blockReason: string | null;
  birthDate: string | null;
  avatarUrl: string | null;
}

// A API admin do Supabase Auth (getUserById) é o único jeito de resolver
// e-mail/último login/banimento a partir de um profile.id — mesmo padrão já
// usado em packages/scraper/core/get-account-recipients.ts (Etapa 9).
export async function getAccountUsers(accountId: string): Promise<AccountUser[]> {
  const supabase = await createClient();
  const serviceClient = createServiceClient();

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, created_at, block_reason, birth_date, avatar_url")
    .eq("account_id", accountId)
    .order("created_at");
  if (error) throw new Error(`Falha ao buscar usuários: ${error.message}`);

  return Promise.all((profiles ?? []).map((profile) => resolveAccountUser(serviceClient, profile)));
}

// Exportada (não mais privada) — reaproveitada por lib/profile/get-own-profile.ts
// pra montar o mesmo formato AccountUser a partir de "id = meu próprio id"
// em vez de "id dentro da minha conta", sem duplicar a chamada à Admin API.
export async function resolveAccountUser(
  serviceClient: ReturnType<typeof createServiceClient>,
  profile: {
    id: string;
    full_name: string | null;
    role: UserRole;
    created_at: string;
    block_reason: string | null;
    birth_date: string | null;
    avatar_url: string | null;
  }
): Promise<AccountUser> {
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
    blockReason: profile.block_reason,
    birthDate: profile.birth_date,
    avatarUrl: profile.avatar_url,
  };
}

// Usada pela página de edição (rota dedicada, não modal) — busca só o
// usuário alvo, já checando que pertence à conta certa (nunca confia no
// userId da URL sozinho, mesmo já atrás de requireRole).
export async function getAccountUser(accountId: string, userId: string): Promise<AccountUser | null> {
  const supabase = await createClient();
  const serviceClient = createServiceClient();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, created_at, block_reason, birth_date, avatar_url")
    .eq("account_id", accountId)
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar usuário: ${error.message}`);
  if (!profile) return null;

  return resolveAccountUser(serviceClient, profile);
}
