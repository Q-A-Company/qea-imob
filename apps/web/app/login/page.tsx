import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { getProfile, roleHome } from "@/lib/auth/dal";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const profile = await getProfile();
  if (profile) redirect(roleHome(profile.role));

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-surface-border bg-surface p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-foreground">
          Q&A Imob
        </h1>
        <p className="mb-6 text-sm text-muted">
          Entre com sua conta para continuar.
        </p>
        <LoginForm />
        {/* Indicação honesta, não uma promessa vaga: o site roda em HTTPS de
            verdade (afirmação verificável), não um selo decorativo genérico
            tipo "ambiente 100% seguro" sem lastro. */}
        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          Conexão segura (HTTPS)
        </p>
        {/* Transparência pra quem usa o sistema (funcionários da empresa
            cliente) — pedido explícito: acesso é monitorado por motivo de
            segurança interna, e isso precisa ser visível na tela de login,
            não só documentado em algum lugar que ninguém lê. */}
        <p className="mt-2 text-center text-xs text-muted">
          Por segurança, os acessos a este sistema são registrados (IP, dispositivo e horário).
        </p>
      </div>
    </main>
  );
}
