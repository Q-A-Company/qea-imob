"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logPasswordResetCompletedAction } from "@/lib/auth/recovery-actions";

type Stage = "loading" | "invalid" | "ready" | "success";

// Diferente de todo o resto do app (que é quase 100% Server Action) — este
// componente PRECISA ser client-side. Confirmado empiricamente (não por
// suposição) como o link de recuperação do Supabase entrega a sessão:
// generateLink({type:'recovery'}) → link do próprio Supabase → redireciona
// pra cá com os tokens no FRAGMENTO da URL (#access_token=...&refresh_token=...),
// não em query string. Fragmento nunca chega ao servidor (Next.js Server
// Component não veria nada) — só dá pra ler via window.location.hash no
// navegador, depois de hidratado.
export function ResetPasswordForm() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("loading");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Uma instância só, reaproveitada entre o setSession() inicial e o
  // updateUser() do submit — @supabase/ssr sincroniza a sessão via
  // document.cookie a cada mudança, então mesmo uma instância nova
  // funcionaria, mas reaproveitar evita qualquer dúvida sobre timing.
  const supabaseRef = useRef(createClient());

  useEffect(() => {
    // Uma única chamada de setState, sempre depois de pelo menos um await —
    // resolveSession() abaixo é puramente síncrona até o ponto do
    // setSession() (uma chamada de rede real), então o resultado final só
    // fica pronto depois de um ciclo assíncrono de qualquer forma, mesmo
    // nos ramos "inválido" — evita setState direto e síncrono no corpo do
    // efeito.
    async function resolveSession(): Promise<Stage> {
      const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
      const params = new URLSearchParams(hash);
      // Limpa o hash da URL assim que lido — evita o token ficar visível na
      // barra de endereço/histórico do navegador pelo resto da sessão.
      window.history.replaceState(null, "", window.location.pathname);

      if (params.get("error")) return "invalid";

      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (!accessToken || !refreshToken) return "invalid";

      const { error: sessionError } = await supabaseRef.current.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      return sessionError ? "invalid" : "ready";
    }

    resolveSession().then(setStage);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setIsSubmitting(true);
    supabaseRef.current.auth.updateUser({ password: newPassword }).then(async ({ error: updateError }) => {
      if (updateError) {
        setError(`Falha ao definir a nova senha: ${updateError.message}`);
        setIsSubmitting(false);
        return;
      }
      await logPasswordResetCompletedAction();
      setStage("success");
      setTimeout(() => router.push("/login"), 2500);
    });
  }

  if (stage === "loading") {
    return <p className="text-sm text-muted">Verificando link...</p>;
  }

  if (stage === "invalid") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-erro-texto" role="alert">
          Este link de recuperação é inválido ou já expirou.
        </p>
        <a href="/forgot-password" className="text-sm text-muted hover:underline">
          Solicitar um novo link
        </a>
      </div>
    );
  }

  if (stage === "success") {
    return <p className="text-sm text-sucesso-texto">Senha alterada. Redirecionando para o login...</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="newPassword" className="text-sm font-medium text-muted">
          Nova senha
        </label>
        <input
          id="newPassword"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
          className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-signal"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="confirmPassword" className="text-sm font-medium text-muted">
          Confirmar nova senha
        </label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
          className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-signal"
        />
      </div>

      {error && (
        <p className="text-sm text-erro-texto" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-2 rounded-md bg-signal px-4 py-2 text-sm font-semibold text-signal-on hover:opacity-90 disabled:opacity-60"
      >
        {isSubmitting ? "Salvando..." : "Definir nova senha"}
      </button>
    </form>
  );
}
