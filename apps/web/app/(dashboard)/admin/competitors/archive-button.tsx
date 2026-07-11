"use client";

import { useState, useTransition } from "react";
import { updateCompetitorStatusAction } from "@/lib/competitors/actions";

// "Arquivar" — ação principal do dia a dia (não exclusão), por isso sem
// modal de confirmação, mesmo padrão de fricção baixa de Pausar/Retomar
// (status-toggle.tsx). Some da listagem ativa e do scheduler, mas nada é
// apagado — ver ReactivateButton (reactivate-button.tsx) pro caminho de
// volta, e DeleteCompetitorButton pra exclusão de verdade (essa sim com
// fricção alta).
export function ArchiveButton({ competitorId }: { competitorId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await updateCompetitorStatusAction(competitorId, "arquivado");
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-md border border-surface-border px-3 py-1.5 text-sm text-muted hover:bg-background hover:text-foreground disabled:opacity-60"
      >
        {isPending ? "Aguarde..." : "Arquivar"}
      </button>
      {error && (
        <p className="max-w-40 text-right text-[11px] text-erro-texto" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
