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
          <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400" role="alert">
            {warning}
          </p>
        )}
        {error && (
          <p className="mt-1.5 text-xs text-red-500" role="alert">
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
            ? "border-green-600/40 bg-green-600/10 text-green-600 hover:bg-green-600/15 dark:border-green-400/40 dark:bg-green-400/10 dark:text-green-400"
            : "border-amber-600/40 bg-amber-600/10 text-amber-600 hover:bg-amber-600/15 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-400"
        }`}
      >
        {isPending ? "Aguarde..." : enabled ? "Ligado" : "Desligado"}
      </button>
    </div>
  );
}
