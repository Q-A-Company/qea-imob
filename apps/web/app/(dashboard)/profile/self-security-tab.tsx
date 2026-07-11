"use client";

import { useState, useTransition } from "react";

// Aba Segurança do PRÓPRIO perfil — só troca de senha. Sem cargo, sem
// bloqueio, sem exclusão: essas ações simplesmente não existem neste
// componente (não é UserSecurityTab com partes escondidas por permissão —
// é outro componente, sem nenhum código capaz de mudar cargo/bloquear/
// excluir), então não há como contorná-las manipulando este formulário.
export function SelfSecurityTab({
  onUpdatePassword,
}: {
  onUpdatePassword: (newPassword: string, confirmPassword: string) => Promise<{ error?: string; success?: boolean }>;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await onUpdatePassword(newPassword, confirmPassword);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        setNewPassword("");
        setConfirmPassword("");
      }
    });
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-surface-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">Alterar senha</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:max-w-sm">
        <div className="flex flex-col gap-1">
          <label htmlFor="newPassword" className="text-xs font-medium text-muted">
            Nova senha
          </label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
            className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-signal"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="confirmPassword" className="text-xs font-medium text-muted">
            Confirmar nova senha
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={8}
            required
            className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-signal"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="w-fit rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-sm text-signal-text hover:bg-signal/15 disabled:opacity-60"
        >
          {isPending ? "Salvando..." : "Alterar senha"}
        </button>
        {error && (
          <p className="text-xs text-erro-texto" role="alert">
            {error}
          </p>
        )}
        {success && <p className="text-xs text-sucesso-texto">Senha alterada.</p>}
      </form>
    </section>
  );
}
