"use client";

import { useState, useTransition } from "react";
import { updateCompetitorStatusAction } from "@/lib/competitors/actions";

// getDueCompetitors() (Etapa 5) já filtra status='ativo' — pausar aqui
// realmente para a checagem automática, não é só cosmético.
//
// Estrutura (padding/borda/tamanho de fonte) igual ao "Verificar agora"
// (check-now-button.tsx) de propósito — mesma família de botão de ação por
// linha, só muda a cor. A cor reflete o que vai ACONTECER ao clicar, não o
// status atual: "Pausar" (concorrente hoje ativo) usa o mesmo tom de aviso
// já usado pro status 'pausado' em outros lugares da tela (STATUS_CLASS em
// page.tsx); "Retomar" (hoje pausado) usa o tom de sucesso já usado pro
// status 'ativo'. Fundo a ~10% de opacidade, borda/texto na cor cheia —
// mesmos tokens (green-600/400, amber-600/400), nenhuma cor nova.
export function StatusToggle({ competitorId, status }: { competitorId: string; status: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isPaused = status === "pausado";

  const toneClass = isPaused
    ? "border-green-600/40 bg-green-600/10 text-green-600 hover:bg-green-600/15 dark:border-green-400/40 dark:bg-green-400/10 dark:text-green-400 dark:hover:bg-green-400/15"
    : "border-amber-600/40 bg-amber-600/10 text-amber-600 hover:bg-amber-600/15 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-400 dark:hover:bg-amber-400/15";

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await updateCompetitorStatusAction(competitorId, isPaused ? "ativo" : "pausado");
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
        {isPending ? "Aguarde..." : isPaused ? "Retomar" : "Pausar"}
      </button>
      {error && (
        <p className="max-w-40 text-right text-[11px] text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
