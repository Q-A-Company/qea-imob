import { ResetPasswordForm } from "./reset-password-form";

// Pública — quem chega aqui vem de um link de recuperação por e-mail, não
// de uma sessão logada normal. Sem requireRole/getProfile: a sessão de
// recuperação só existe no CLIENTE depois do fragmento da URL ser lido
// (ver reset-password-form.tsx), o Server Component nunca vê nada disso.
export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 dark:bg-neutral-950">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="mb-1 text-xl font-semibold text-neutral-900 dark:text-neutral-50">Definir nova senha</h1>
        <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">Escolha uma nova senha para sua conta.</p>
        <ResetPasswordForm />
      </div>
    </main>
  );
}
