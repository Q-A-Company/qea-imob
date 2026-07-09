"use client";

import { useActionState } from "react";
import { registerCompetitorAction, type RegisterCompetitorState } from "@/lib/competitors/actions";

const initialState: RegisterCompetitorState = {};

const inputClass =
  "rounded-md border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-signal";

// Cadastro mínimo — sem aprendizado via IA/preview (ver comentário na
// Server Action). Suficiente pra registrar nome + abreviação (necessária
// pro gráfico de pizza por concorrente) + URL.
export function RegisterCompetitorForm() {
  const [state, formAction, pending] = useActionState(registerCompetitorAction, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-lg border border-surface-border bg-surface p-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-xs font-medium text-muted">
          Nome
        </label>
        <input id="name" name="name" required className={inputClass} placeholder="Imobiliária Exemplo" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="abbreviation" className="text-xs font-medium text-muted">
          Abreviação
        </label>
        <input id="abbreviation" name="abbreviation" required maxLength={6} className={`${inputClass} w-24 uppercase`} placeholder="EX" />
      </div>

      <div className="flex flex-1 min-w-48 flex-col gap-1">
        <label htmlFor="listingUrl" className="text-xs font-medium text-muted">
          URL da listagem
        </label>
        <input id="listingUrl" name="listingUrl" type="url" required className={inputClass} placeholder="https://exemplo.com.br/imoveis" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="pollingIntervalMinutes" className="text-xs font-medium text-muted">
          Intervalo (min)
        </label>
        <input
          id="pollingIntervalMinutes"
          name="pollingIntervalMinutes"
          type="number"
          min={1}
          defaultValue={5}
          required
          className={`${inputClass} w-20`}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-signal px-4 py-2 text-sm font-semibold text-signal-on hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Cadastrando..." : "Cadastrar"}
      </button>

      {state.error && (
        <p className="w-full text-sm text-red-500" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
