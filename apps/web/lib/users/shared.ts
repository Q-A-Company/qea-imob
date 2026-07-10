import "server-only";
import { randomBytes } from "crypto";
import type { createClient } from "@/lib/supabase/server";

// Banimento "efetivamente permanente" — a Admin API do Supabase Auth exige
// uma duração (não tem um "banido para sempre" literal), 'none' reativa.
// Ver node_modules/@supabase/auth-js: ban_duration em AdminUserAttributes.
// Compartilhado entre as Server Actions do SuperAdmin
// (superadmin/accounts/[id]/actions.ts) e do Admin/Gerente (lib/users/actions.ts)
// — um único lugar pra essa constante de segurança, não duas cópias que
// podem divergir sem ninguém notar.
export const BAN_FOREVER = "876000h"; // 100 anos

export function generateTempPassword(): string {
  return randomBytes(9).toString("base64url");
}

// Bloqueia desativar/excluir/rebaixar o ÚLTIMO admin ("Diretor / T.I") de
// uma conta — decisão confirmada com o usuário: sem isso, um erro
// operacional (excluir o único Diretor por engano) deixaria a conta cliente
// sem ninguém pra se autogerenciar até o SuperAdmin notar e criar outro.
// Usado tanto pelas Server Actions do SuperAdmin quanto do Admin/Gerente —
// a regra vale independente de quem está executando a ação.
export async function wouldRemoveLastAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  accountId: string,
  excludingUserId: string
): Promise<boolean> {
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("role", "admin")
    .neq("id", excludingUserId);
  return (count ?? 0) === 0;
}
