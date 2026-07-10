import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveAccountUser, type AccountUser } from "@/lib/users/get-account-users";

// Diferente de getAccountUser (lib/users/get-account-users.ts), que exige
// account_id bater — aqui não filtra por conta nenhuma, só por "é a minha
// própria linha", porque SuperAdmin não TEM account_id (profiles.account_id
// é null pra ele) e getAccountUser nunca encontraria a própria linha dele.
// Autoatendimento não precisa da checagem de posse por conta: você sempre
// pode ver/editar a si mesmo, independente de cargo.
export async function getOwnProfile(userId: string): Promise<AccountUser | null> {
  const supabase = await createClient();
  const serviceClient = createServiceClient();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, created_at, block_reason, birth_date, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar perfil: ${error.message}`);
  if (!profile) return null;

  return resolveAccountUser(serviceClient, profile);
}
