import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { getProfile, roleHome } from "@/lib/auth/dal";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const profile = await getProfile();
  if (profile) redirect(roleHome(profile.role));

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 dark:bg-neutral-950">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="mb-1 text-xl font-semibold text-neutral-900 dark:text-neutral-50">
          Q&A Imob
        </h1>
        <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
          Entre com sua conta para continuar.
        </p>
        <LoginForm />
        {/* Indicação honesta, não uma promessa vaga: o site roda em HTTPS de
            verdade (afirmação verificável), não um selo decorativo genérico
            tipo "ambiente 100% seguro" sem lastro. */}
        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-neutral-400 dark:text-neutral-500">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          Conexão segura (HTTPS)
        </p>
        {/* Transparência pra quem usa o sistema (funcionários da empresa
            cliente) — pedido explícito: acesso é monitorado por motivo de
            segurança interna, e isso precisa ser visível na tela de login,
            não só documentado em algum lugar que ninguém lê. */}
        <p className="mt-2 text-center text-xs text-neutral-400 dark:text-neutral-500">
          Por segurança, os acessos a este sistema são registrados (IP, dispositivo e horário).
        </p>
      </div>
    </main>
  );
}
