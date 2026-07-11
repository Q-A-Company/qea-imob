"use client";

import { useState, useTransition } from "react";
import { updateGlobalEmailToggleAction } from "./actions";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR");
}

export function GlobalEmailToggle({ initialEnabled, initialUpdatedAt }: { initialEnabled: boolean; initialUpdatedAt: string }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    const next = !enabled;
    startTransition(async () => {
      const result = await updateGlobalEmailToggleAction(next);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEnabled(next);
      setUpdatedAt(new Date().toISOString());
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-surface-border bg-surface p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Envio de e-mail — plataforma inteira</p>
          <p className="mt-0.5 text-xs text-muted">
            Desligar isso impede TODOS os e-mails de todas as contas (incluindo o resumo diário) — use só pra manutenção ou
            emergência (ex: corrigir um conteúdo errado antes de liberar de novo).
          </p>
        </div>
        <button
          type="button"
          onClick={handleClick}
          disabled={isPending}
          className={`shrink-0 rounded-md border px-3 py-1.5 text-sm disabled:opacity-60 ${
            enabled
              ? "border-sucesso/40 bg-sucesso/10 text-sucesso-texto hover:bg-sucesso/15"
              : "border-erro/40 bg-erro/10 text-erro-texto hover:bg-erro/15"
          }`}
        >
          {isPending ? "Aguarde..." : enabled ? "Ligado" : "Desligado"}
        </button>
      </div>
      {error && (
        <p className="text-xs text-erro-texto" role="alert">
          {error}
        </p>
      )}
      <p className="text-xs text-muted">Última alteração: {formatDateTime(updatedAt)}</p>
    </div>
  );
}
