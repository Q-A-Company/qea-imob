"use client";

import { useState, useTransition } from "react";
import { updateMaxCompetitorsAction } from "./actions";
import { MaxCompetitorsChoice } from "@/app/max-competitors-choice";

// Mesmo padrão de AccountNameEditor (estado local + botão Salvar chamando
// a Server Action diretamente) — só que o valor em si vem do componente
// compartilhado com o formulário de criação de conta (max-competitors-choice.tsx).
export function MaxCompetitorsEditor({ accountId, initialValue }: { accountId: string; initialValue: number | null }) {
  const [value, setValue] = useState<number | null>(initialValue);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setStatus("idle");
    setError(null);
    startTransition(async () => {
      const result = await updateMaxCompetitorsAction(accountId, value);
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
      <span className="text-xs font-medium text-muted">Máximo de concorrentes</span>
      <MaxCompetitorsChoice
        value={value}
        onChange={(next) => {
          setValue(next);
          setStatus("idle");
        }}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || value === initialValue}
          className="w-fit rounded-md border border-surface-border px-3 py-1.5 text-sm text-foreground hover:bg-background disabled:opacity-60"
        >
          {isPending ? "Salvando..." : "Salvar limite"}
        </button>
        {status === "saved" && <span className="text-xs text-sucesso-texto">Salvo.</span>}
        {status === "error" && (
          <span className="text-xs text-erro-texto" role="alert">
            {error}
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted">
        Conta concorrentes ativos/pausados/com erro — arquivados não contam pro limite. Vale pra novos cadastros e
        pra reativar um concorrente arquivado.
      </p>
    </div>
  );
}
