"use client";

import { useState, useTransition } from "react";
import { updateAccountStatusAction } from "./actions";

// Mesmo padrão visual/estrutural de admin/competitors/status-toggle.tsx —
// família de botão "muda o que vai acontecer ao clicar", cor reflete a ação
// (não o estado atual).
export function AccountStatusToggle({ accountId, active }: { accountId: string; active: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toneClass = active
    ? "border-amber-600/40 bg-amber-600/10 text-amber-600 hover:bg-amber-600/15 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-400 dark:hover:bg-amber-400/15"
    : "border-green-600/40 bg-green-600/10 text-green-600 hover:bg-green-600/15 dark:border-green-400/40 dark:bg-green-400/10 dark:text-green-400 dark:hover:bg-green-400/15";

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await updateAccountStatusAction(accountId, !active);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className={`rounded-md border px-3 py-1.5 text-sm disabled:opacity-60 ${toneClass}`}
      >
        {isPending ? "Aguarde..." : active ? "Desativar conta" : "Ativar conta"}
      </button>
      {error && (
        <p className="max-w-48 text-right text-[11px] text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
