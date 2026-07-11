"use client";

import { useState, useTransition } from "react";
import { updateNotificationChannelAction } from "./actions";

// Mesmo padrão visual/estrutural de status-toggle.tsx/account-status-toggle.tsx
// — clique já dispara a ação (sem formulário/botão "Salvar" separado),
// consistente com o resto do app.
export function NotificationChannelToggle({
  channel,
  label,
  description,
  initialEnabled,
}: {
  channel: "site" | "email";
  label: string;
  description: string;
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    setWarning(null);
    const next = !enabled;
    startTransition(async () => {
      const result = await updateNotificationChannelAction(channel, next);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEnabled(next);
      if (result.warning) setWarning(result.warning);
    });
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-surface-border bg-surface p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
        {warning && (
          <p className="mt-1.5 text-xs text-erro-texto" role="alert">
            {warning}
          </p>
        )}
        {error && (
          <p className="mt-1.5 text-xs text-erro-texto" role="alert">
            {error}
          </p>
        )}
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
  );
}
