"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/dal";
import { logAuditEvent } from "@/lib/audit/log";
import { sendEmail } from "scraper/core/send-email";

// 2 minutos — "simples por agora" (decisão confirmada com o usuário).
// generateLink via Admin API (service role) não passa pelo rate limit
// nativo do GoTrue (esse só cobre o endpoint público resetPasswordForEmail,
// que a gente NÃO usa de propósito — queremos template próprio via Resend,
// não o e-mail nativo do Supabase). Guardado em password_recovery_requests
// (migration 0020), não em memória — precisa sobreviver a múltiplas
// instâncias/restart do processo Next.js.
const RATE_LIMIT_WINDOW_MS = 2 * 60 * 1000;

// Mesma mensagem em QUALQUER caso (e-mail existe, não existe, ou está sob
// rate limit) — anti-enumeração pedido explicitamente: um atacante não
// consegue distinguir "não cadastrado" de "acabou de pedir há 1 minuto" de
// "cadastrado, e-mail a caminho" só olhando a resposta.
const GENERIC_MESSAGE = "Se esse e-mail existir em nossa base, você receberá um link de recuperação em instantes.";

export interface RequestPasswordRecoveryState {
  message?: string;
  error?: string;
}

export async function requestPasswordRecoveryAction(
  _prevState: RequestPasswordRecoveryState,
  formData: FormData
): Promise<RequestPasswordRecoveryState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) return { error: "Informe um e-mail válido." };

  const supabase = createServiceClient();

  const { data: existingRequest } = await supabase
    .from("password_recovery_requests")
    .select("requested_at")
    .eq("email", email)
    .maybeSingle();
  if (existingRequest && Date.now() - new Date(existingRequest.requested_at).getTime() < RATE_LIMIT_WINDOW_MS) {
    return { message: GENERIC_MESSAGE };
  }
  await supabase.from("password_recovery_requests").upsert({ email, requested_at: new Date().toISOString() });

  const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${appBaseUrl}/reset-password` },
  });

  // error aqui normalmente significa "e-mail não cadastrado" — nunca vaza
  // isso pro cliente (mesma mensagem genérica de qualquer forma). Enviado
  // mesmo pra conta banida/inativa (decisão confirmada com o usuário): não
  // enviar nesses casos vazaria "essa conta existe e está banida" por
  // AUSÊNCIA de e-mail, o mesmo problema de enumeração de outro jeito.
  if (!error && data.properties?.action_link) {
    try {
      await sendEmail({
        to: [email],
        subject: "Recuperação de senha — Q&A Imob",
        title: "Recuperação de senha",
        message:
          "Recebemos um pedido para redefinir a senha da sua conta na Q&A Imob. Clique no botão abaixo para definir uma nova senha.\n\nSe você não pediu isso, pode ignorar este e-mail com segurança — sua senha continua a mesma.",
        cta: { text: "Definir nova senha", url: data.properties.action_link },
      });
    } catch {
      // best-effort, mesmo padrão de core/notify.ts — nunca revela ao
      // cliente se o envio de fato saiu, e-mail é um canal que pode falhar.
    }
  }

  return { message: GENERIC_MESSAGE };
}

export interface LogPasswordResetState {
  success?: boolean;
}

// Chamado pelo client (reset-password-form.tsx) DEPOIS que
// supabase.auth.updateUser({password}) já teve sucesso do lado do
// navegador — createBrowserClient (@supabase/ssr) escreve os cookies de
// sessão automaticamente a cada mudança, então quando isto chega aqui via
// Server Action, requireRole() já enxerga a sessão de recuperação como uma
// sessão válida normal. Só para manter o audit_log consistente com
// user_password_reset (mesmo action_type já usado quando Admin/Gerente
// redefine a senha de outro usuário) — mode:"recovery_link" distingue.
export async function logPasswordResetCompletedAction(): Promise<LogPasswordResetState> {
  const viewer = await requireRole(["superadmin", "admin", "gerente", "usuario"]);
  await logAuditEvent({
    actorUserId: viewer.id,
    accountId: viewer.account_id,
    actionType: "user_password_reset",
    targetType: "user",
    targetId: viewer.id,
    details: { mode: "recovery_link" },
  });
  // Sessão de recuperação NÃO deve virar a sessão "de verdade" do usuário —
  // ela nunca passou pelas checagens do login() (conta banida/inativa,
  // login_audit_log). Desloga aqui; reset-password-form.tsx redireciona pro
  // /login logo em seguida, pra entrar pela porta da frente com a senha nova.
  const supabase = await createClient();
  await supabase.auth.signOut();
  return { success: true };
}
