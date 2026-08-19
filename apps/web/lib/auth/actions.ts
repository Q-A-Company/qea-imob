"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { roleHome } from "@/lib/auth/dal";
import { recordLoginAudit } from "@/lib/audit/login-audit";
import { logAuditEvent } from "@/lib/audit/log";

export interface LoginState {
  error?: string;
}

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = formData.get("email");
  const password = formData.get("password");
  // Checkbox nativo: "on" quando marcado, ausente do FormData quando não.
  const rememberMe = formData.get("rememberMe") === "on";

  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return { error: "Informe e-mail e senha." };
  }

  const supabase = await createClient({ rememberMe });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // user_banned é um ErrorCode distinto de invalid_credentials (confirmado
    // contra a API real do Supabase Auth) — vale mostrar mensagem clara.
    // Trade-off aceito conscientemente: o Supabase revela user_banned mesmo
    // com senha errada, então isso funciona como um oráculo de enumeração
    // (dá pra descobrir que uma conta existe e está banida sem saber a
    // senha) — aceitável no porte deste produto (B2B, poucas contas),
    // decisão confirmada com o usuário antes de implementar.
    if (error.code === "user_banned") {
      return { error: "Seu acesso foi desativado. Entre em contato com o administrador da sua empresa." };
    }
    return { error: "E-mail ou senha inválidos." };
  }
  if (!data.user) {
    return { error: "E-mail ou senha inválidos." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, account_id")
    .eq("id", data.user.id)
    .single();

  if (!profile) {
    await supabase.auth.signOut();
    return { error: "Usuário sem perfil associado. Contate o administrador." };
  }

  // accounts.active não bane o usuário no Supabase Auth (só é um campo na
  // nossa própria tabela) — sem este check, o login teria sucesso e só
  // getProfile() bloquearia depois, no próximo request, deixando o usuário
  // preso num loop de redirect sem entender por quê. Checar aqui dá a
  // mensagem certa na hora.
  if (profile.account_id) {
    const { data: account } = await supabase.from("accounts").select("active, access_expires_at").eq("id", profile.account_id).single();
    if (!account?.active) {
      await supabase.auth.signOut();
      return { error: "A conta da sua empresa está desativada. Entre em contato com o suporte." };
    }
    // Mesma checagem, mensagem distinta — accounts.access_expires_at
    // (migration 0029) é independente de "active" (um SuperAdmin pode
    // desativar por outro motivo sem mexer na data, e vice-versa).
    if (account.access_expires_at && new Date(account.access_expires_at) <= new Date()) {
      await supabase.auth.signOut();
      return { error: "O acesso da sua empresa expirou. Entre em contato com o suporte." };
    }
  }

  // Depois de todas as checagens (banido, conta ativa) — só registra login
  // que de fato vai completar. Duas tabelas, dois propósitos: login_audit_log
  // é o forense (IP/dispositivo/tela, aba "Acessos"); audit_log é a entrada
  // genérica na timeline de ações (aba "Histórico"), ao lado de qualquer
  // outra ação do usuário. As duas são best-effort (nunca bloqueiam o login).
  await recordLoginAudit(data.user.id, profile.account_id, formData);
  await logAuditEvent({
    actorUserId: data.user.id,
    accountId: profile.account_id,
    actionType: "login",
    targetType: "user",
    targetId: data.user.id,
  });

  redirect(roleHome(profile.role));
}

export async function logout() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase.from("profiles").select("account_id").eq("id", user.id).single();
    await logAuditEvent({
      actorUserId: user.id,
      accountId: profile?.account_id ?? null,
      actionType: "logout",
      targetType: "user",
      targetId: user.id,
    });
  }

  await supabase.auth.signOut();
  redirect("/login");
}
