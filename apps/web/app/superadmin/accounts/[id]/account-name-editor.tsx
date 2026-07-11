"use client";

import { useState, useTransition } from "react";
import { updateAccountNameAction } from "./actions";

// Nome da imobiliária — diferente de AccountNotesEditor (texto livre sem
// validação), aqui não pode ficar em branco (é o identificador visível da
// conta em toda a plataforma, não uma anotação interna).
export function AccountNameEditor({ accountId, initialName }: { accountId: string; initialName: string }) {
  const [name, setName] = useState(initialName);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setStatus("idle");
    setError(null);
    startTransition(async () => {
      const result = await updateAccountNameAction(accountId, name);
      if (result.error) {
        setStatus("error");
        setError(result.error);
      } else {
        setStatus("saved");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-surface-border bg-surface p-4">
      <label htmlFor="account-name" className="text-xs font-medium text-muted">
        Nome da imobiliária
      </label>
      <input
        id="account-name"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setStatus("idle");
        }}
        className="w-full max-w-sm rounded-md border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-signal"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || !name.trim()}
          className="w-fit rounded-md border border-surface-border px-3 py-1.5 text-sm text-foreground hover:bg-background disabled:opacity-60"
        >
          {isPending ? "Salvando..." : "Salvar nome"}
        </button>
        {status === "saved" && <span className="text-xs text-sucesso-texto">Salvo.</span>}
        {status === "error" && (
          <span className="text-xs text-erro-texto" role="alert">
            {error}
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted">
        Aparece no banner &quot;Visualizando&quot; (todas as páginas desta conta), na lista de Clientes do SuperAdmin
        e no cabeçalho de relatórios impressos/exportados por Diretor, Gerente e Corretor.
      </p>
    </div>
  );
}
