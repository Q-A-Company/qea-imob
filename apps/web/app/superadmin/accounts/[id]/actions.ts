"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { UserRole } from "@/lib/supabase/types";
import { BAN_FOREVER, buildProfileUpdateDetails, generateTempPassword, wouldRemoveLastAdmin } from "@/lib/users/shared";
import type { CreateUserState } from "@/lib/users/types";
import { logAuditEvent } from "@/lib/audit/log";

// Confirma que o profile pertence à conta antes de qualquer mutação — a
// Admin API do Supabase Auth não sabe nada de account_id, então sem isso um
// accountId adulterado no client poderia disparar uma ação de gestão (ban,
// reset de senha, exclusão) num usuário de OUTRA conta. Mesmo padrão de
// reverificação já usado em lib/competitors/actions.ts. Devolve o role atual
// também — usado pelas chamadas que precisam checar a regra do último admin.
async function assertUserBelongsToAccount(userId: string, accountId: string): Promise<{ error?: string; role?: UserRole }> {
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("account_id, role").eq("id", userId).maybeSingle();
  if (!profile || profile.account_id !== accountId) {
    return { error: "Usuário não encontrado ou não pertence a esta conta" };
  }
  return { role: profile.role };
}

export interface ActionState {
  error?: string;
  success?: boolean;
}

export async function updateAccountStatusAction(accountId: string, active: boolean): Promise<ActionState> {
  const viewer = await requireRole("superadmin");
  const supabase = await createClient();
  const { error } = await supabase.from("accounts").update({ active }).eq("id", accountId);
  if (error) return { error: `Falha ao atualizar status da conta: ${error.message}` };
  await logAuditEvent({
    actorUserId: viewer.id,
    accountId,
    actionType: "account_status_changed",
    targetType: "account",
    targetId: accountId,
    details: { active },
  });
  // 'layout' revalida o subtree inteiro (banner no layout.tsx também lê o
  // status da conta) — não só a página de configurações.
  revalidatePath(`/superadmin/accounts/${accountId}`, "layout");
  revalidatePath("/superadmin");
  return { success: true };
}

export async function updateAccountNotesAction(accountId: string, notes: string): Promise<ActionState> {
  const viewer = await requireRole("superadmin");
  const supabase = await createClient();
  const { error } = await supabase.from("accounts").update({ internal_notes: notes || null }).eq("id", accountId);
  if (error) return { error: `Falha ao salvar notas: ${error.message}` };
  await logAuditEvent({
    actorUserId: viewer.id,
    accountId,
    actionType: "account_notes_updated",
    targetType: "account",
    targetId: accountId,
  });
  revalidatePath(`/superadmin/accounts/${accountId}/settings`);
  return { success: true };
}

// accountId vem primeiro de propósito (não userId) — é o que permite
// `changeUserRoleAction.bind(null, accountId)` virar uma função (userId,
// newRole) => ... passável como prop pra um Client Component. Uma arrow
// function inline (closure) NÃO pode atravessar a fronteira Server→Client
// ("Functions cannot be passed directly to Client Components..."); só a
// própria Server Action ou um .bind() dela pode — e bind só pré-preenche
// argumentos a partir do início da lista.
export async function changeUserRoleAction(accountId: string, userId: string, newRole: UserRole): Promise<ActionState> {
  const viewer = await requireRole("superadmin");
  if (newRole !== "admin" && newRole !== "gerente" && newRole !== "usuario") return { error: "Cargo inválido" };

  const guard = await assertUserBelongsToAccount(userId, accountId);
  if (guard.error) return guard;

  const supabase = await createClient();

  if (guard.role === "admin" && newRole !== "admin" && (await wouldRemoveLastAdmin(supabase, accountId, userId))) {
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
    details: { oldRole: guard.role, newRole },
  });
  revalidatePath(`/superadmin/accounts/${accountId}/users`);
  return { success: true };
}

export interface ToggleBanState extends ActionState {}

// Desativar/ativar via ban_duration nativo do GoTrue (decisão confirmada
// com o usuário) — não duplica estado em profiles, o próprio Supabase Auth
// impede login enquanto banido. reason: motivo opcional, mesma lógica de
// lib/users/actions.ts (toggleUserBanActionForAdmin).
// accountId primeiro — mesmo motivo de changeUserRoleAction (bind-ability).
export async function toggleUserBanAction(accountId: string, userId: string, ban: boolean, reason?: string): Promise<ToggleBanState> {
  const viewer = await requireRole("superadmin");
  const guard = await assertUserBelongsToAccount(userId, accountId);
  if (guard.error) return guard;

  if (ban && guard.role === "admin") {
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
  revalidatePath(`/superadmin/accounts/${accountId}/users`);
  return { success: true };
}

export interface DeleteUserState extends ActionState {}

// Exclusão definitiva — a UI exige dupla confirmação antes de chamar isso
// (ver delete-user-button.tsx). profiles.id referencia auth.users com
// on delete cascade, então apagar o usuário aqui já remove o profile junto,
// sem precisar de um segundo delete.
// accountId primeiro — mesmo motivo de changeUserRoleAction (bind-ability).
export async function deleteUserAction(accountId: string, userId: string): Promise<DeleteUserState> {
  const viewer = await requireRole("superadmin");
  const guard = await assertUserBelongsToAccount(userId, accountId);
  if (guard.error) return guard;

  if (guard.role === "admin") {
    const supabase = await createClient();
    if (await wouldRemoveLastAdmin(supabase, accountId, userId)) {
      return { error: "Esta conta ficaria sem nenhum Diretor / T.I — exclua outro Diretor primeiro, ou crie um novo." };
    }
  }

  const serviceClient = createServiceClient();
  const { data: targetAuthUser } = await serviceClient.auth.admin.getUserById(userId);
  const { error } = await serviceClient.auth.admin.deleteUser(userId);
  if (error) return { error: `Falha ao excluir usuário: ${error.message}` };

  await logAuditEvent({
    actorUserId: viewer.id,
    accountId,
    actionType: "user_deleted",
    targetType: "user",
    targetId: userId,
    details: { email: targetAuthUser?.user?.email ?? null, role: guard.role },
  });
  revalidatePath(`/superadmin/accounts/${accountId}/users`);
  revalidatePath("/superadmin");
  return { success: true };
}

export interface ResetPasswordState extends ActionState {
  tempPassword?: string;
  recoveryLink?: string;
}

// Dois mecanismos, decisão confirmada com o usuário ("os dois"):
// - "temporary": updateUserById com uma senha nova gerada aqui — aplicada
//   na hora, funciona mesmo sem e-mail configurado (email_enabled=false em
//   todas as contas hoje, Etapa 9).
// - "link": generateLink (recovery) gera o link, mas o Supabase NÃO manda
//   e-mail sozinho ("to be sent via a custom email provider") — o
//   SuperAdmin precisa copiar e entregar manualmente por fora até
//   email_enabled/Resend estarem ativos de verdade.
// accountId primeiro — mesmo motivo de changeUserRoleAction (bind-ability).
export async function resetUserPasswordAction(
  accountId: string,
  userId: string,
  email: string,
  mode: "temporary" | "link"
): Promise<ResetPasswordState> {
  const viewer = await requireRole("superadmin");
  const guard = await assertUserBelongsToAccount(userId, accountId);
  if (guard.error) return guard;

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

// Terceira opção — mesma lógica de setUserPasswordActionForAdmin
// (lib/users/actions.ts): admin digita a senha diretamente, em vez de
// gerar uma senha aleatória ou um link. accountId primeiro (bind-ability),
// mesmo motivo das demais actions deste arquivo.
export async function setUserPasswordAction(accountId: string, userId: string, newPassword: string): Promise<ActionState> {
  const viewer = await requireRole("superadmin");
  const guard = await assertUserBelongsToAccount(userId, accountId);
  if (guard.error) return guard;

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

// Mesma lógica de scripts/create-admin.mjs (auth.admin.createUser + trigger
// on_auth_user_created cria o profile), agora como Server Action na
// interface em vez de script manual. Senha gerada automaticamente (não
// digitada pelo SuperAdmin) — mesmo raciocínio do reset: evita senha fraca
// escolhida às pressas, exibida uma vez pra copiar e repassar.
export async function createUserAction(_prevState: CreateUserState, formData: FormData): Promise<CreateUserState> {
  const viewer = await requireRole("superadmin");

  const accountId = String(formData.get("accountId") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const roleRaw = String(formData.get("role") ?? "");
  const role: UserRole = roleRaw === "admin" ? "admin" : roleRaw === "gerente" ? "gerente" : "usuario";

  if (!accountId) return { error: "Conta inválida" };
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
  revalidatePath(`/superadmin/accounts/${accountId}/users`);
  revalidatePath("/superadmin");
  return { success: true, createdEmail: email, tempPassword };
}

// Aba "Dados do Colaborador" — mesma lógica de lib/users/actions.ts
// (updateUserProfileActionForAdmin), accountId primeiro por causa do
// .bind() (ver comentário em changeUserRoleAction acima).
export async function updateUserProfileAction(
  accountId: string,
  userId: string,
  fullName: string,
  email: string,
  birthDate: string | null
): Promise<ActionState> {
  const viewer = await requireRole("superadmin");
  const guard = await assertUserBelongsToAccount(userId, accountId);
  if (guard.error) return guard;

  const trimmedName = fullName.trim();
  const trimmedEmail = email.trim();
  const trimmedBirthDate = birthDate || null;
  if (!trimmedName) return { error: "Nome é obrigatório" };
  if (!trimmedEmail || !trimmedEmail.includes("@")) return { error: "E-mail inválido" };

  const supabase = await createClient();
  const serviceClient = createServiceClient();

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
  revalidatePath(`/superadmin/accounts/${accountId}/users`);
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

// Mesma lógica de lib/users/actions.ts (uploadUserAvatarActionForAdmin) —
// service role, ignora a policy de self-upload de propósito.
export async function uploadUserAvatarAction(accountId: string, userId: string, formData: FormData): Promise<UploadAvatarState> {
  const viewer = await requireRole("superadmin");
  const guard = await assertUserBelongsToAccount(userId, accountId);
  if (guard.error) return guard;

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
  revalidatePath(`/superadmin/accounts/${accountId}/users`);
  return { success: true, avatarUrl };
}

// Mesma lógica de lib/users/actions.ts (removeUserAvatarActionForAdmin) —
// lista a pasta inteira em vez de deduzir um path fixo, pra não deixar
// arquivo órfão se o formato da foto mudou entre uploads.
export async function removeUserAvatarAction(accountId: string, userId: string): Promise<ActionState> {
  const viewer = await requireRole("superadmin");
  const guard = await assertUserBelongsToAccount(userId, accountId);
  if (guard.error) return guard;

  const serviceClient = createServiceClient();
  const { data: files } = await serviceClient.storage.from("avatars").list(userId);
  if (files && files.length > 0) {
    await serviceClient.storage.from("avatars").remove(files.map((f) => `${userId}/${f.name}`));
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId);
  if (error) return { error: `Falha ao remover foto: ${error.message}` };

  await logAuditEvent({
    actorUserId: viewer.id,
    accountId,
    actionType: "user_avatar_removed",
    targetType: "user",
    targetId: userId,
  });
  revalidatePath(`/superadmin/accounts/${accountId}/users`);
  return { success: true };
}
