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
    ? "border-erro/40 bg-erro/10 text-erro-texto hover:bg-erro/15"
    : "border-sucesso/40 bg-sucesso/10 text-sucesso-texto hover:bg-sucesso/15";

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
        <p className="max-w-48 text-right text-[11px] text-erro-texto" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
