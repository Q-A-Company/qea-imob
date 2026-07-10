"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { UserRole } from "@/lib/supabase/types";
import { buildProfileUpdateDetails } from "@/lib/users/shared";
import { logAuditEvent } from "@/lib/audit/log";

// Autoatendimento — qualquer cargo pode editar os PRÓPRIOS dados. Diferente
// de lib/users/actions.ts (Admin/Gerente) e superadmin/accounts/[id]/actions.ts
// (SuperAdmin gerenciando outra conta), aqui não há checagem de "alvo
// pertence à minha conta" nem de hierarquia (assertCanManage) — você sempre
// pode editar a si mesmo, e não existe aqui NENHUMA ação de cargo/bloqueio/
// exclusão (essas continuam exclusivas de quem gerencia outros usuários, na
// tela de gestão — ver user-security-tab.tsx). self-security-tab.tsx (a
// única aba de Segurança que usa este arquivo) só chama updateOwnPasswordAction.
const ANY_ROLE: UserRole[] = ["superadmin", "admin", "gerente", "usuario"];

export interface ActionState {
  error?: string;
  success?: boolean;
}

// _userId: existe só pra esta action ter a MESMA assinatura de
// updateUserProfileActionForAdmin (lib/users/actions.ts), o que permite
// reaproveitar UserEmployeeDataTab sem modificar nada nele. O valor NÃO é
// usado pra decidir quem está sendo editado — isso vem sempre de
// requireRole().id (a sessão), nunca de um argumento vindo do client.
export async function updateOwnProfileAction(
  _userId: string,
  fullName: string,
  email: string,
  birthDate: string | null
): Promise<ActionState> {
  const viewer = await requireRole(ANY_ROLE);

  const trimmedName = fullName.trim();
  const trimmedEmail = email.trim();
  const trimmedBirthDate = birthDate || null;
  if (!trimmedName) return { error: "Nome é obrigatório" };
  if (!trimmedEmail || !trimmedEmail.includes("@")) return { error: "E-mail inválido" };

  const supabase = await createClient();
  const serviceClient = createServiceClient();

  const [{ data: currentProfile }, { data: currentAuthUser }] = await Promise.all([
    supabase.from("profiles").select("full_name, birth_date").eq("id", viewer.id).single(),
    serviceClient.auth.admin.getUserById(viewer.id),
  ]);
  const oldEmail = currentAuthUser?.user?.email ?? null;

  if (oldEmail !== trimmedEmail) {
    const { error: emailError } = await serviceClient.auth.admin.updateUserById(viewer.id, {
      email: trimmedEmail,
      email_confirm: true,
    });
    if (emailError) return { error: `Falha ao alterar e-mail: ${emailError.message}` };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: trimmedName, birth_date: trimmedBirthDate })
    .eq("id", viewer.id);
  if (error) return { error: `Falha ao salvar dados: ${error.message}` };

  await logAuditEvent({
    actorUserId: viewer.id,
    accountId: viewer.account_id,
    actionType: "user_updated",
    targetType: "user",
    targetId: viewer.id,
    details: buildProfileUpdateDetails(
      { fullName: currentProfile?.full_name ?? null, email: oldEmail, birthDate: currentProfile?.birth_date ?? null },
      { fullName: trimmedName, email: trimmedEmail, birthDate: trimmedBirthDate }
    ),
  });
  revalidatePath("/profile");
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

// _userId: mesmo raciocínio de updateOwnProfileAction acima.
export async function uploadOwnAvatarAction(_userId: string, formData: FormData): Promise<UploadAvatarState> {
  const viewer = await requireRole(ANY_ROLE);

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { error: "Nenhuma imagem selecionada." };
  const extension = AVATAR_ALLOWED_TYPES[file.type];
  if (!extension) return { error: "Formato não suportado — use JPEG, PNG ou WebP." };
  if (file.size > AVATAR_MAX_BYTES) return { error: "Imagem muito grande — limite de 2 MB." };

  const serviceClient = createServiceClient();
  const path = `${viewer.id}/avatar.${extension}`;
  const { error: uploadError } = await serviceClient.storage.from("avatars").upload(path, file, {
    upsert: true,
    contentType: file.type,
  });
  if (uploadError) return { error: `Falha ao enviar foto: ${uploadError.message}` };

  const { data: publicUrlData } = serviceClient.storage.from("avatars").getPublicUrl(path);
  const avatarUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", viewer.id);
  if (error) return { error: `Falha ao salvar foto: ${error.message}` };

  await logAuditEvent({
    actorUserId: viewer.id,
    accountId: viewer.account_id,
    actionType: "user_avatar_updated",
    targetType: "user",
    targetId: viewer.id,
  });
  revalidatePath("/profile");
  return { success: true, avatarUrl };
}

// Troca de senha AUTOATENDIMENTO — usa a própria sessão (supabase.auth.
// updateUser, client RLS-scoped), não a Admin API: é a pessoa mudando a
// PRÓPRIA senha, diferente de um admin resetando a de outra (ver
// resetUserPasswordActionForAdmin em lib/users/actions.ts, que continua
// exclusivo da tela de gestão). Não pede senha atual — o Supabase Auth não
// expõe essa verificação nesta chamada; a sessão ativa já é a prova de
// posse da conta.
export async function updateOwnPasswordAction(newPassword: string, confirmPassword: string): Promise<ActionState> {
  const viewer = await requireRole(ANY_ROLE);
  if (newPassword.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres." };
  if (newPassword !== confirmPassword) return { error: "As senhas não coincidem." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: `Falha ao alterar senha: ${error.message}` };

  await logAuditEvent({
    actorUserId: viewer.id,
    accountId: viewer.account_id,
    actionType: "user_password_changed",
    targetType: "user",
    targetId: viewer.id,
  });
  return { success: true };
}
