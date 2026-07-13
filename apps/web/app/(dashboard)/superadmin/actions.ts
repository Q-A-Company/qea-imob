"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/dal";
import { createServiceClient } from "@/lib/supabase/service";
import { generateTempPassword } from "@/lib/users/shared";
import { logAuditEvent } from "@/lib/audit/log";
import type { CreateAccountState } from "@/lib/accounts/types";

// Cria uma conta nova (imobiliária) do zero + o primeiro Admin dela, no
// mesmo fluxo — sem nenhum usuário, a conta ficaria criada mas ninguém
// conseguiria logar nela. Ordem importa: accounts precisa existir ANTES de
// auth.admin.createUser — o trigger handle_new_user (insere em profiles,
// disparado pelo createUser) tem uma FK real pra accounts.id; chamar na
// ordem errada faz o Postgres reverter a criação do usuário inteira com
// "violates foreign key constraint" (ver supabase/migrations/0001_init.sql).
// Service role (não o cliente RLS-scoped) — accounts só tem policy de
// INSERT para is_superadmin(), e auth.admin.createUser sempre precisa de
// service role de qualquer forma (mesmo padrão de createUserAction).
export async function createAccountAction(_prevState: CreateAccountState, formData: FormData): Promise<CreateAccountState> {
  const viewer = await requireRole("superadmin");

  const accountName = String(formData.get("accountName") ?? "").trim();
  const adminFullName = String(formData.get("adminFullName") ?? "").trim();
  const adminEmail = String(formData.get("adminEmail") ?? "").trim();

  if (!accountName) return { error: "Nome da imobiliária é obrigatório" };
  if (!adminFullName) return { error: "Nome do administrador é obrigatório" };
  if (!adminEmail || !adminEmail.includes("@")) return { error: "E-mail inválido" };

  const supabase = createServiceClient();

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .insert({ name: accountName, active: true })
    .select("id")
    .single();
  if (accountError || !account) return { error: `Falha ao criar conta: ${accountError?.message ?? "erro desconhecido"}` };

  // notification_settings.account_id é a própria PK (não autogerada) —
  // mesma linha que supabase/seed.sql insere manualmente pra conta demo;
  // sem isso, a tela de Configurações da conta nova quebraria ao tentar
  // ler preferências de notificação inexistentes.
  const { error: notifSettingsError } = await supabase
    .from("notification_settings")
    .insert({ account_id: account.id, email_enabled: false, whatsapp_enabled: false, site_enabled: true });
  if (notifSettingsError) {
    await supabase.from("accounts").delete().eq("id", account.id);
    return { error: `Falha ao configurar conta: ${notifSettingsError.message}` };
  }

  const tempPassword = generateTempPassword();
  const { data: userData, error: userError } = await supabase.auth.admin.createUser({
    email: adminEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { role: "admin", account_id: account.id, full_name: adminFullName },
  });
  if (userError || !userData.user) {
    // Desfaz a conta inteira (cascade cuida de notification_settings junto)
    // — sem usuário nenhum, ninguém consegue logar nela, e uma conta órfã
    // só atrapalharia a lista do SuperAdmin depois.
    await supabase.from("accounts").delete().eq("id", account.id);
    return { error: `Falha ao criar administrador: ${userError?.message ?? "erro desconhecido"}` };
  }

  await logAuditEvent({
    actorUserId: viewer.id,
    accountId: account.id,
    actionType: "account_created",
    targetType: "account",
    targetId: account.id,
    details: { name: accountName, adminEmail },
  });

  revalidatePath("/superadmin");
  return { success: true, accountId: account.id, createdEmail: adminEmail, tempPassword };
}
