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

// Nome exibido em 3 lugares (ver AccountNameEditor): banner "Visualizando"
// do layout.tsx, lista de Clientes do SuperAdmin, e cabeçalho de relatórios
// impressos/exportados (Admin/Gerente/Corretor) — por isso revalida o
// mesmo par de paths que updateAccountStatusAction (também aparece nos
// dois primeiros); o cabeçalho de impressão não precisa de revalidação
// própria porque busca a conta de novo a cada carga da página de relatórios.
export async function updateAccountNameAction(accountId: string, name: string): Promise<ActionState> {
  const viewer = await requireRole("superadmin");
  const trimmed = name.trim();
  if (!trimmed) return { error: "Nome não pode ficar em branco" };

  const supabase = await createClient();
  const { data: current } = await supabase.from("accounts").select("name").eq("id", accountId).maybeSingle();

  const { error } = await supabase.from("accounts").update({ name: trimmed }).eq("id", accountId);
  if (error) return { error: `Falha ao atualizar nome da conta: ${error.message}` };

  await logAuditEvent({
    actorUserId: viewer.id,
    accountId,
    actionType: "account_name_changed",
    targetType: "account",
    targetId: accountId,
    details: { oldName: current?.name ?? null, newName: trimmed },
  });
  revalidatePath(`/superadmin/accounts/${accountId}`, "layout");
  revalidatePath("/superadmin");
  return { success: true };
}

// null = sem limite. Mesma validação de createAccountAction
// ((dashboard)/superadmin/actions.ts) — os dois caminhos que gravam esta
// coluna, mantidos consistentes de propósito.
export async function updateMaxCompetitorsAction(accountId: string, maxCompetitors: number | null): Promise<ActionState> {
  const viewer = await requireRole("superadmin");
  if (maxCompetitors !== null && (!Number.isInteger(maxCompetitors) || maxCompetitors <= 0)) {
    return { error: "Máximo de concorrentes precisa ser um número inteiro positivo, ou sem limite" };
  }

  const supabase = await createClient();
  const { data: current } = await supabase.from("accounts").select("max_competitors").eq("id", accountId).maybeSingle();

  const { error } = await supabase.from("accounts").update({ max_competitors: maxCompetitors }).eq("id", accountId);
  if (error) return { error: `Falha ao atualizar limite de concorrentes: ${error.message}` };

  await logAuditEvent({
    actorUserId: viewer.id,
    accountId,
    actionType: "account_max_competitors_changed",
    targetType: "account",
    targetId: accountId,
    details: { oldValue: current?.max_competitors ?? null, newValue: maxCompetitors },
  });
  revalidatePath(`/superadmin/accounts/${accountId}/settings`);
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

export interface ClearErrorRunsState {
  error?: string;
  success?: boolean;
  deletedCount?: number;
}

// Apaga permanentemente as linhas de scraper_runs que aparecem no
// Relatório de Erros desta conta (mesmo filtro de
// get-account-error-runs.ts: success=false OU
// stopped_early_due_to_error=true) — não toca em execuções bem-sucedidas,
// essas continuam aparecendo no Histórico normalmente. Seguro quanto a
// integridade: property_changes.scraper_run_id é "on delete set null"
// (migration 0016) — nenhuma mudança de preço/disponibilidade já
// detectada é perdida, só o vínculo com QUAL execução a detectou.
// Decisão confirmada com o usuário: apaga de verdade, não só esconde/
// marca como dispensado.
export async function clearAccountErrorRunsAction(accountId: string): Promise<ClearErrorRunsState> {
  const viewer = await requireRole("superadmin");

  // Service role — mesmo raciocínio já documentado em
  // admin/settings/actions.ts (clearAccountHistoryAction): a autorização de
  // verdade é o requireRole acima, não depende de nenhuma política de RLS
  // específica pra este caso.
  const supabase = createServiceClient();

  const { data: competitors, error: competitorsError } = await supabase
    .from("competitors")
    .select("id")
    .eq("account_id", accountId);
  if (competitorsError) return { error: `Falha ao buscar concorrentes: ${competitorsError.message}` };
  const competitorIds = (competitors ?? []).map((c) => c.id);
  if (competitorIds.length === 0) return { success: true, deletedCount: 0 };

  const { data: deleted, error: deleteError } = await supabase
    .from("scraper_runs")
    .delete()
    .in("competitor_id", competitorIds)
    .or("success.eq.false,stopped_early_due_to_error.eq.true")
    .select("id");
  if (deleteError) return { error: `Falha ao apagar execuções com erro: ${deleteError.message}` };

  const deletedCount = deleted?.length ?? 0;

  await logAuditEvent({
    actorUserId: viewer.id,
    accountId,
    actionType: "error_runs_cleared",
    targetType: "account",
    targetId: accountId,
    details: { deletedCount, competitorsAffected: competitorIds.length },
  });

  revalidatePath(`/superadmin/accounts/${accountId}/errors`);
  return { success: true, deletedCount };
}

// Zona de perigo — apaga a conta inteira e TUDO que depende dela,
// permanentemente. `accounts.id` é referenciado com "on delete cascade"
// por profiles, competitors, notification_settings, notifications,
// restricted_leads, email_digest_log, login_audit_log e audit_log —
// e a cadeia continua sozinha a partir de competitors (site_configs,
// properties, scraper_runs, e property_changes via properties), todos
// "on delete cascade" também (ver supabase/migrations/0001_init.sql). Um
// único DELETE em accounts já limpa tudo isso.
//
// MAS isso não apaga os usuários do Supabase Auth (auth.users) — a FK de
// profiles.account_id cascade A PARTIR de accounts, só que profiles.id
// referencia auth.users no sentido INVERSO; apagar accounts nunca chega
// lá. Sem tratar isso à parte, o auth.users ficaria órfão (sem profile,
// mas ainda existindo, tecnicamente capaz de tentar logar). Por isso cada
// usuário é apagado primeiro via auth.admin.deleteUser (que já cascade-
// apaga o profile dele, mesmo comportamento de deleteUserAction) — só
// depois disso a conta em si é apagada.
//
// Auditoria PRECISA ser gravada ANTES do delete: audit_log.account_id tem
// FK pra accounts.id — gravar depois de apagar a conta violaria a
// constraint (o registro não teria mais o que referenciar).
export async function deleteAccountAction(accountId: string): Promise<ActionState> {
  const viewer = await requireRole("superadmin");
  const supabase = createServiceClient();

  const { data: account } = await supabase.from("accounts").select("id, name").eq("id", accountId).maybeSingle();
  if (!account) return { error: "Conta não encontrada" };

  const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id").eq("account_id", accountId);
  if (profilesError) return { error: `Falha ao buscar usuários da conta: ${profilesError.message}` };

  await logAuditEvent({
    actorUserId: viewer.id,
    accountId,
    actionType: "account_deleted",
    targetType: "account",
    targetId: accountId,
    details: { name: account.name, usersDeleted: profiles?.length ?? 0 },
  });

  for (const profile of profiles ?? []) {
    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(profile.id);
    if (deleteUserError) {
      return {
        error: `Falha ao apagar usuário ${profile.id} durante a exclusão da conta: ${deleteUserError.message}. A conta NÃO foi apagada — corrija o problema e tente de novo.`,
      };
    }
  }

  const { error: deleteAccountError } = await supabase.from("accounts").delete().eq("id", accountId);
  if (deleteAccountError) return { error: `Falha ao apagar conta: ${deleteAccountError.message}` };

  revalidatePath("/superadmin");
  return { success: true };
}
