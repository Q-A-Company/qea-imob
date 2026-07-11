"use client";

import { useState, useTransition } from "react";
import { updateCompetitorStatusAction } from "@/lib/competitors/actions";

// Volta direto pra 'ativo' — SEM re-rodar aprendizado via IA (o
// site_config antigo continua válido, só precisa voltar a ser verificado a
// partir de agora). Mesma baixa fricção de ArchiveButton, nenhum modal.
export function ReactivateButton({ competitorId }: { competitorId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await updateCompetitorStatusAction(competitorId, "ativo");
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-md border border-sucesso/40 bg-sucesso/10 px-3 py-1.5 text-sm text-sucesso-texto hover:bg-sucesso/15 disabled:opacity-60"
      >
        {isPending ? "Aguarde..." : "Reativar"}
      </button>
      {error && (
        <p className="max-w-40 text-right text-[11px] text-erro-texto" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
