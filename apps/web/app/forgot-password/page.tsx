import { redirect } from "next/navigation";
import { getProfile, roleHome } from "@/lib/auth/dal";
import { ForgotPasswordForm } from "./forgot-password-form";

// Pública (sem requireRole) — quem está tentando recuperar a senha, por
// definição, não está logado. Se já estiver, redireciona (mesmo padrão de
// /login).
export default async function ForgotPasswordPage() {
  const profile = await getProfile();
  if (profile) redirect(roleHome(profile.role));

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-surface-border bg-surface p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-foreground">Esqueci minha senha</h1>
        <p className="mb-6 text-sm text-muted">
          Informe o e-mail da sua conta para receber um link de recuperação.
        </p>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
