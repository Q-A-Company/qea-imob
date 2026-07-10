"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { UserRole } from "@/lib/supabase/types";
import { BAN_FOREVER, generateTempPassword, wouldRemoveLastAdmin } from "./shared";
import type { CreateUserState } from "./types";

// Gestão de usuários pelo Admin ("Diretor / T.I") ou Gerente da PRÓPRIA
// conta — diferente de app/superadmin/accounts/[id]/actions.ts (SuperAdmin
// gerencia qualquer conta, recebe accountId explícito do client), aqui o
// accountId nunca é parâmetro: vem sempre do profile de quem está logado,
// via requireRole. Isso é o que impede um Admin de uma conta mexer em
// usuários de outra só adulterando um campo escondido no formulário.

export interface ActionState {
  error?: string;
  success?: boolean;
}

async function requireAccountManager() {
  return requireRole(["admin", "gerente"]);
}

// Confirma que o alvo pertence à MESMA conta de quem está executando, e
// devolve o role atual do alvo — usado tanto pro teto de hierarquia
// (gerente só mexe em usuario) quanto pra regra do último admin.
async function getTargetInAccount(userId: string, accountId: string): Promise<{ error?: string; role?: UserRole }> {
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("account_id, role").eq("id", userId).maybeSingle();
  if (!profile || profile.account_id !== accountId) {
    return { error: "Usuário não encontrado ou não pertence à sua conta" };
  }
  return { role: profile.role };
}

// Gerente só gerencia usuario (Corretor) — nunca outro gerente ou admin
// (par ou superior a si mesmo). Admin ("Diretor / T.I") gerencia qualquer
// cargo dentro da própria conta. Decisão confirmada com o usuário.
function assertCanManage(viewerRole: UserRole, targetRole: UserRole): string | null {
  if (viewerRole === "gerente" && targetRole !== "usuario") {
    return "Gerente só gerencia usuários com cargo Corretor.";
  }
  return null;
}

export async function changeUserRoleActionForAdmin(userId: string, newRole: UserRole): Promise<ActionState> {
  const viewer = await requireAccountManager();
  // Gerente nem vê o seletor de cargo na UI (ver assignableRoles em
  // user-management-table.tsx) — checado aqui de novo como defesa em
  // profundidade contra uma chamada direta à Server Action.
  if (viewer.role === "gerente") return { error: "Gerente não pode alterar cargos." };
  if (newRole !== "admin" && newRole !== "gerente" && newRole !== "usuario") return { error: "Cargo inválido" };

  const accountId = viewer.account_id!;
  const target = await getTargetInAccount(userId, accountId);
  if (target.error) return target;

  const supabase = await createClient();
  if (target.role === "admin" && newRole !== "admin" && (await wouldRemoveLastAdmin(supabase, accountId, userId))) {
    return { error: "Esta conta ficaria sem nenhum Diretor / T.I — mude o cargo de outro Diretor primeiro, ou crie um novo." };
  }

  const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", userId);
  if (error) return { error: `Falha ao mudar cargo: ${error.message}` };
  revalidatePath("/admin/users");
  return { success: true };
}

export async function toggleUserBanActionForAdmin(userId: string, ban: boolean): Promise<ActionState> {
  const viewer = await requireAccountManager();
  const accountId = viewer.account_id!;
  const target = await getTargetInAccount(userId, accountId);
  if (target.error) return target;

  const manageError = assertCanManage(viewer.role, target.role!);
  if (manageError) return { error: manageError };

  if (ban && target.role === "admin") {
    const supabase = await createClient();
    if (await wouldRemoveLastAdmin(supabase, accountId, userId)) {
      return { error: "Esta conta ficaria sem nenhum Diretor / T.I — desative outro Diretor primeiro, ou crie um novo." };
    }
  }

  const serviceClient = createServiceClient();
  const { error } = await serviceClient.auth.admin.updateUserById(userId, { ban_duration: ban ? BAN_FOREVER : "none" });
  if (error) return { error: `Falha ao ${ban ? "desativar" : "reativar"} usuário: ${error.message}` };
  revalidatePath("/admin/users");
  return { success: true };
}

export async function deleteUserActionForAdmin(userId: string): Promise<ActionState> {
  const viewer = await requireAccountManager();
  const accountId = viewer.account_id!;
  const target = await getTargetInAccount(userId, accountId);
  if (target.error) return target;

  const manageError = assertCanManage(viewer.role, target.role!);
  if (manageError) return { error: manageError };

  if (target.role === "admin") {
    const supabase = await createClient();
    if (await wouldRemoveLastAdmin(supabase, accountId, userId)) {
      return { error: "Esta conta ficaria sem nenhum Diretor / T.I — exclua outro Diretor primeiro, ou crie um novo." };
    }
  }

  const serviceClient = createServiceClient();
  const { error } = await serviceClient.auth.admin.deleteUser(userId);
  if (error) return { error: `Falha ao excluir usuário: ${error.message}` };
  revalidatePath("/admin/users");
  return { success: true };
}

export interface ResetPasswordState extends ActionState {
  tempPassword?: string;
  recoveryLink?: string;
}

export async function resetUserPasswordActionForAdmin(
  userId: string,
  email: string,
  mode: "temporary" | "link"
): Promise<ResetPasswordState> {
  const viewer = await requireAccountManager();
  const accountId = viewer.account_id!;
  const target = await getTargetInAccount(userId, accountId);
  if (target.error) return target;

  const manageError = assertCanManage(viewer.role, target.role!);
  if (manageError) return { error: manageError };

  const serviceClient = createServiceClient();
  if (mode === "temporary") {
    const tempPassword = generateTempPassword();
    const { error } = await serviceClient.auth.admin.updateUserById(userId, { password: tempPassword });
    if (error) return { error: `Falha ao redefinir senha: ${error.message}` };
    return { success: true, tempPassword };
  }

  const { data, error } = await serviceClient.auth.admin.generateLink({ type: "recovery", email });
  if (error) return { error: `Falha ao gerar link de redefinição: ${error.message}` };
  return { success: true, recoveryLink: data.properties.action_link };
}

// Mesma lógica de scripts/create-admin.mjs / createUserAction do SuperAdmin
// — senha gerada automaticamente, exibida uma única vez. Gerente só pode
// cadastrar Corretor (checado aqui mesmo sem o seletor de cargo aparecer
// pra ele em create-user-form.tsx — defesa em profundidade).
export async function createUserActionForAdmin(_prevState: CreateUserState, formData: FormData): Promise<CreateUserState> {
  const viewer = await requireAccountManager();
  const accountId = viewer.account_id!;

  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const roleRaw = String(formData.get("role") ?? "");
  const role: UserRole = roleRaw === "admin" ? "admin" : roleRaw === "gerente" ? "gerente" : "usuario";

  if (viewer.role === "gerente" && role !== "usuario") {
    return { error: "Gerente só pode cadastrar usuários com cargo Corretor." };
  }
  if (!email || !email.includes("@")) return { error: "E-mail inválido" };
  if (!fullName) return { error: "Nome é obrigatório" };

  const tempPassword = generateTempPassword();
  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { role, account_id: accountId, full_name: fullName },
  });
  if (error || !data.user) return { error: `Falha ao criar usuário: ${error?.message ?? "erro desconhecido"}` };

  revalidatePath("/admin/users");
  return { success: true, createdEmail: email, tempPassword };
}
