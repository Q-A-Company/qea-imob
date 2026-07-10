"use client";

import { useActionState } from "react";
import { checkCompetitorNowAction, type CheckCompetitorNowState } from "@/lib/competitors/actions";

const initialState: CheckCompetitorNowState = {};

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

// "X imóveis capturados" sempre aparece; o resto só entra quando > 0, pra
// não poluir o caso comum (a maioria das checagens não tem mudança
// nenhuma). Ordem: preço, adicionados, removidos, reapareceram.
function formatChangesBreakdown(changesByType: { price: number; added: number; removed: number; reappeared: number }): string {
  const parts: string[] = [];
  if (changesByType.price > 0) parts.push(`${changesByType.price} ${pluralize(changesByType.price, "mudança de preço", "mudanças de preço")}`);
  if (changesByType.added > 0) parts.push(`${changesByType.added} ${pluralize(changesByType.added, "adicionado", "adicionados")}`);
  if (changesByType.removed > 0) parts.push(`${changesByType.removed} ${pluralize(changesByType.removed, "removido", "removidos")}`);
  if (changesByType.reappeared > 0)
    parts.push(`${changesByType.reappeared} ${pluralize(changesByType.reappeared, "reapareceu", "reapareceram")}`);
  return parts.length > 0 ? parts.join(" · ") : "nenhuma mudança";
}

export function CheckNowButton({ competitorId }: { competitorId: string }) {
  const [state, formAction, pending] = useActionState(checkCompetitorNowAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="competitorId" value={competitorId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        {pending ? "Verificando..." : "Verificar agora"}
      </button>

      {state.error && (
        <p className="max-w-64 text-right text-xs text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}

      {state.result && (
        <p
          className={`max-w-64 text-right text-xs ${
            state.result.success && !state.result.stoppedEarlyDueToError
              ? "text-green-600 dark:text-green-400"
              : "text-amber-600 dark:text-amber-400"
          }`}
        >
          {state.result.success
            ? `${state.result.propertiesCaptured} imóveis capturados · ${formatChangesBreakdown(state.result.changesByType)}${
                state.result.stoppedEarlyDueToError ? " (parou cedo por erro)" : ""
              }${state.result.pausedByCircuitBreaker ? " · pausado automaticamente" : ""}${
                state.result.reactivatedAfterSuccess ? " · reativado" : ""
              }${state.result.configMarkedDegraded ? " · seletores desatualizados, recalibração pendente" : ""}`
            : `Falhou${state.result.errorMessage ? `: ${state.result.errorMessage}` : ""}`}
        </p>
      )}
    </form>
  );
}
