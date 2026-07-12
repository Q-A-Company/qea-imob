import { ResetPasswordForm } from "./reset-password-form";

// Pública — quem chega aqui vem de um link de recuperação por e-mail, não
// de uma sessão logada normal. Sem requireRole/getProfile: a sessão de
// recuperação só existe no CLIENTE depois do fragmento da URL ser lido
// (ver reset-password-form.tsx), o Server Component nunca vê nada disso.
export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-surface-border bg-surface p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-foreground">Definir nova senha</h1>
        <p className="mb-6 text-sm text-muted">Escolha uma nova senha para sua conta.</p>
        <ResetPasswordForm />
      </div>
    </main>
  );
}
