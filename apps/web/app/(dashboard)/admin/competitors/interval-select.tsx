"use client";

import { useState, useTransition } from "react";
import { updateCompetitorIntervalAction } from "@/lib/competitors/actions";
import { ALLOWED_POLLING_INTERVALS } from "@/lib/competitors/constants";

// getDueCompetitors() lê polling_interval_minutes direto do banco a cada
// execução, sem cache — a mudança vale a partir do próximo tick do
// scheduler, sem precisar reiniciar nada.
//
// minMinutes: menor intervalo seguro PRA ESTE concorrente (calculado em
// page.tsx a partir da duração média das últimas checagens limpas ×
// SAFETY_MULTIPLIER, mesma função que check-competitor.ts usa pra ajustar
// sozinho) — opções abaixo dele ficam desabilitadas, não removidas (fica
// visível o degrau existe mas não é seguro pra este concorrente
// específico, em vez de só sumir sem explicação).
export function IntervalSelect({ competitorId, minutes, minMinutes }: { competitorId: string; minutes: number; minMinutes: number }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Defensivo: se o valor atual no banco não for uma das opções (dado
  // legado, seed antigo), inclui ele na lista só pra exibição — não deixa
  // o <select> mostrar em branco, mas também não é uma opção real: qualquer
  // troca volta pro conjunto fixo.
  const options = ALLOWED_POLLING_INTERVALS.includes(minutes as (typeof ALLOWED_POLLING_INTERVALS)[number])
    ? ALLOWED_POLLING_INTERVALS
    : [minutes, ...ALLOWED_POLLING_INTERVALS].sort((a, b) => a - b);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setError(null);
    const value = Number(e.target.value);
    startTransition(async () => {
      const result = await updateCompetitorIntervalAction(competitorId, value);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <select
        value={minutes}
        onChange={handleChange}
        disabled={isPending}
        className="rounded-md border border-surface-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-signal disabled:opacity-60"
      >
        {options.map((m) => (
          <option key={m} value={m} disabled={m < minMinutes} title={m < minMinutes ? `Abaixo do mínimo seguro (${minMinutes} min) para este concorrente` : undefined}>
            a cada {m} min{m < minMinutes ? " (não seguro)" : ""}
          </option>
        ))}
      </select>
      {error && (
        <p className="max-w-40 text-right text-[11px] text-erro-texto" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
