"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { UserRole } from "@/lib/supabase/types";
import { BAN_FOREVER, buildProfileUpdateDetails, generateTempPassword, wouldRemoveLastAdmin } from "./shared";
import type { CreateUserState } from "./types";
import { logAuditEvent } from "@/lib/audit/log";

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
  await logAuditEvent({
    actorUserId: viewer.id,
    accountId,
    actionType: "user_role_changed",
    targetType: "user",
    targetId: userId,
    details: { oldRole: target.role, newRole },
  });
  revalidatePath("/admin/users");
  return { success: true };
}

// reason: motivo opcional (texto livre, nunca obrigatório — pedido
// explícito). Só relevante pra ban=true; ignorado em ban=false (o motivo do
// bloqueio ATUAL some quando o acesso é reativado — profiles.block_reason
// reflete só o estado corrente, o histórico de motivos ao longo do tempo
// mora no audit_log via details, não aqui).
export async function toggleUserBanActionForAdmin(userId: string, ban: boolean, reason?: string): Promise<ActionState> {
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

  const supabase = await createClient();
  await supabase
    .from("profiles")
    .update({ block_reason: ban ? (reason?.trim() ?? null) : null })
    .eq("id", userId);

  await logAuditEvent({
    actorUserId: viewer.id,
    accountId,
    actionType: ban ? "user_blocked" : "user_unblocked",
    targetType: "user",
    targetId: userId,
    details: ban && reason?.trim() ? { reason: reason.trim() } : undefined,
  });
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
  // Snapshot ANTES de excluir — depois do delete não tem mais como buscar
  // e-mail/nome pra registrar no audit_log o que exatamente foi removido.
  const { data: targetAuthUser } = await serviceClient.auth.admin.getUserById(userId);
  const { error } = await serviceClient.auth.admin.deleteUser(userId);
  if (error) return { error: `Falha ao excluir usuário: ${error.message}` };

  await logAuditEvent({
    actorUserId: viewer.id,
    accountId,
    actionType: "user_deleted",
    targetType: "user",
    targetId: userId,
    details: { email: targetAuthUser?.user?.email ?? null, role: target.role },
  });
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
    await logAuditEvent({
      actorUserId: viewer.id,
      accountId,
      actionType: "user_password_reset",
      targetType: "user",
      targetId: userId,
      details: { mode },
    });
    return { success: true, tempPassword };
  }

  const { data, error } = await serviceClient.auth.admin.generateLink({ type: "recovery", email });
  if (error) return { error: `Falha ao gerar link de redefinição: ${error.message}` };
  await logAuditEvent({
    actorUserId: viewer.id,
    accountId,
    actionType: "user_password_reset",
    targetType: "user",
    targetId: userId,
    details: { mode },
  });
  return { success: true, recoveryLink: data.properties.action_link };
}

// Terceira opção, ao lado de "temporary"/"link" (resetUserPasswordActionForAdmin
// acima): admin digita a senha diretamente, em vez de gerar uma senha
// aleatória ou um link — útil quando o admin quer definir algo específico
// na hora (ex: repassando por telefone), sem depender do fluxo de
// copiar/colar de um valor gerado. Usa a Admin API (não a sessão do
// próprio admin) porque é ELE definindo a senha de OUTRA pessoa — diferente
// de updateOwnPasswordAction (lib/profile/actions.ts), que é autoatendimento.
export async function setUserPasswordActionForAdmin(userId: string, newPassword: string): Promise<ActionState> {
  const viewer = await requireAccountManager();
  const accountId = viewer.account_id!;
  const target = await getTargetInAccount(userId, accountId);
  if (target.error) return target;

  const manageError = assertCanManage(viewer.role, target.role!);
  if (manageError) return { error: manageError };

  if (newPassword.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres." };

  const serviceClient = createServiceClient();
  const { error } = await serviceClient.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) return { error: `Falha ao definir senha: ${error.message}` };

  await logAuditEvent({
    actorUserId: viewer.id,
    accountId,
    actionType: "user_password_reset",
    targetType: "user",
    targetId: userId,
    details: { mode: "direct" },
  });
  return { success: true };
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

  await logAuditEvent({
    actorUserId: viewer.id,
    accountId,
    actionType: "user_created",
    targetType: "user",
    targetId: data.user.id,
    details: { email, role },
  });
  revalidatePath("/admin/users");
  return { success: true, createdEmail: email, tempPassword };
}

// Aba "Dados do Colaborador" — nome/e-mail/data de nascimento. E-mail mora
// em auth.users, não em profiles: só chama a Admin API quando ele de fato
// mudou, pra não reconfirmar à toa a cada save (email_confirm:true evita
// reabrir um fluxo de confirmação que este produto não usa).
export async function updateUserProfileActionForAdmin(
  userId: string,
  fullName: string,
  email: string,
  birthDate: string | null
): Promise<ActionState> {
  const viewer = await requireAccountManager();
  const accountId = viewer.account_id!;
  const target = await getTargetInAccount(userId, accountId);
  if (target.error) return target;

  const manageError = assertCanManage(viewer.role, target.role!);
  if (manageError) return { error: manageError };

  const trimmedName = fullName.trim();
  const trimmedEmail = email.trim();
  const trimmedBirthDate = birthDate || null;
  if (!trimmedName) return { error: "Nome é obrigatório" };
  if (!trimmedEmail || !trimmedEmail.includes("@")) return { error: "E-mail inválido" };

  const supabase = await createClient();
  const serviceClient = createServiceClient();

  // Valores ANTES da mudança — precisa vir antes do update pra
  // buildProfileUpdateDetails conseguir montar o {from,to} de cada campo.
  const [{ data: currentProfile }, { data: currentAuthUser }] = await Promise.all([
    supabase.from("profiles").select("full_name, birth_date").eq("id", userId).single(),
    serviceClient.auth.admin.getUserById(userId),
  ]);
  const oldEmail = currentAuthUser?.user?.email ?? null;

  if (oldEmail !== trimmedEmail) {
    const { error: emailError } = await serviceClient.auth.admin.updateUserById(userId, {
      email: trimmedEmail,
      email_confirm: true,
    });
    if (emailError) return { error: `Falha ao alterar e-mail: ${emailError.message}` };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: trimmedName, birth_date: trimmedBirthDate })
    .eq("id", userId);
  if (error) return { error: `Falha ao salvar dados do colaborador: ${error.message}` };

  await logAuditEvent({
    actorUserId: viewer.id,
    accountId,
    actionType: "user_updated",
    targetType: "user",
    targetId: userId,
    details: buildProfileUpdateDetails(
      { fullName: currentProfile?.full_name ?? null, email: oldEmail, birthDate: currentProfile?.birth_date ?? null },
      { fullName: trimmedName, email: trimmedEmail, birthDate: trimmedBirthDate }
    ),
  });
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  return { success: true };
}

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface UploadAvatarState extends ActionState {
  avatarUrl?: string;
}

// Upload feito pelo Admin/Gerente em nome do colaborador — usa service role
// de propósito, ignorando a policy "avatars_write_own_folder" (que só cobre
// autoatualização, ver supabase/migrations/0015_avatars_bucket.sql). Path
// fixo ({userId}/avatar.{ext}) faz o upload seguinte sobrescrever o
// anterior (upsert:true) em vez de acumular arquivos órfãos.
export async function uploadUserAvatarActionForAdmin(userId: string, formData: FormData): Promise<UploadAvatarState> {
  const viewer = await requireAccountManager();
  const accountId = viewer.account_id!;
  const target = await getTargetInAccount(userId, accountId);
  if (target.error) return target;

  const manageError = assertCanManage(viewer.role, target.role!);
  if (manageError) return { error: manageError };

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { error: "Nenhuma imagem selecionada." };
  const extension = AVATAR_ALLOWED_TYPES[file.type];
  if (!extension) return { error: "Formato não suportado — use JPEG, PNG ou WebP." };
  if (file.size > AVATAR_MAX_BYTES) return { error: "Imagem muito grande — limite de 2 MB." };

  const serviceClient = createServiceClient();
  const path = `${userId}/avatar.${extension}`;
  const { error: uploadError } = await serviceClient.storage.from("avatars").upload(path, file, {
    upsert: true,
    contentType: file.type,
  });
  if (uploadError) return { error: `Falha ao enviar foto: ${uploadError.message}` };

  const { data: publicUrlData } = serviceClient.storage.from("avatars").getPublicUrl(path);
  // Cache-bust: o path é sempre o mesmo, então sem isso o navegador
  // continuaria mostrando a foto antiga em cache depois de um reupload.
  const avatarUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", userId);
  if (error) return { error: `Falha ao salvar foto: ${error.message}` };

  await logAuditEvent({
    actorUserId: viewer.id,
    accountId,
    actionType: "user_avatar_updated",
    targetType: "user",
    targetId: userId,
  });
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  return { success: true, avatarUrl };
}
