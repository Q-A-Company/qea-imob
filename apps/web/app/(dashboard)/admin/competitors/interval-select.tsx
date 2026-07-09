"use client";

import { useState, useTransition } from "react";
import { updateCompetitorIntervalAction } from "@/lib/competitors/actions";
import { ALLOWED_POLLING_INTERVALS } from "@/lib/competitors/constants";

// getDueCompetitors() lê polling_interval_minutes direto do banco a cada
// execução, sem cache — a mudança vale a partir do próximo tick do
// scheduler, sem precisar reiniciar nada.
export function IntervalSelect({ competitorId, minutes }: { competitorId: string; minutes: number }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Defensivo: se o valor atual no banco não for uma das 4 opções (dado
  // legado, seed antigo), inclui ele na lista só pra exibição — não deixa
  // o <select> mostrar em branco, mas também não é uma 5ª opção real:
  // qualquer troca volta pro conjunto fixo.
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
          <option key={m} value={m}>
            a cada {m} min
          </option>
        ))}
      </select>
      {error && (
        <p className="max-w-40 text-right text-[11px] text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
