"use client";

import { useActionState, useState } from "react";
import { createAccountAction } from "./actions";
import type { CreateAccountState } from "@/lib/accounts/types";
import { MaxCompetitorsChoice } from "../../max-competitors-choice";

const initialState: CreateAccountState = {};

const inputClass =
  "rounded-md border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-signal";

// Cria a conta (imobiliária) e o primeiro Admin dela num único envio —
// mesmo raciocínio de senha temporária exibida uma única vez que
// create-user-form.tsx já usa (nunca fica salva em lugar nenhum depois
// deste retorno).
export function CreateAccountForm() {
  const [state, formAction, pending] = useActionState(createAccountAction, initialState);
  // Sem limite por padrão — igual ao comportamento de toda conta existente
  // hoje (max_competitors null); o SuperAdmin escolhe um teto explícito se
  // quiser, aqui ou depois em Configurações.
  const [maxCompetitors, setMaxCompetitors] = useState<number | null>(null);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-surface-border bg-surface p-4">
      <p className="text-sm font-medium text-foreground">Cadastrar nova imobiliária</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="accountName" className="text-xs font-medium text-muted">
            Nome da imobiliária
          </label>
          <input id="accountName" name="accountName" required className={inputClass} placeholder="Imobiliária Exemplo" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="adminFullName" className="text-xs font-medium text-muted">
            Nome do administrador
          </label>
          <input id="adminFullName" name="adminFullName" required className={inputClass} placeholder="Maria Silva" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="adminEmail" className="text-xs font-medium text-muted">
            E-mail do administrador
          </label>
          <input
            id="adminEmail"
            name="adminEmail"
            type="email"
            required
            className={inputClass}
            placeholder="maria@imobiliariaexemplo.com.br"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Máximo de concorrentes</span>
          <MaxCompetitorsChoice value={maxCompetitors} onChange={setMaxCompetitors} />
          <input type="hidden" name="maxCompetitors" value={maxCompetitors === null ? "" : String(maxCompetitors)} />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-signal px-4 py-2 text-sm font-semibold text-signal-on hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Criando..." : "Criar conta"}
        </button>
      </div>

      {state.error && (
        <p className="text-sm text-erro-texto" role="alert">
          {state.error}
        </p>
      )}

      {state.success && state.tempPassword && (
        <div className="rounded-md border border-signal/40 bg-signal/10 p-3 text-sm">
          <p className="text-foreground">
            Conta criada. Administrador <strong>{state.createdEmail}</strong> — senha temporária (copie agora, não será mostrada
            de novo):
          </p>
          <code className="mt-1 block w-fit rounded bg-background px-2 py-1 font-mono text-sm text-foreground">
            {state.tempPassword}
          </code>
        </div>
      )}
    </form>
  );
}
