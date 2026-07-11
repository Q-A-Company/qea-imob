"use client";

import { useState, useTransition } from "react";
import { updateAccountNotesAction } from "./actions";

// Texto livre, só o SuperAdmin vê essa tela — sem validação de conteúdo,
// é literalmente uma anotação (ex: "cliente piloto, condição especial de
// exclusividade até dd/mm").
export function AccountNotesEditor({ accountId, initialNotes }: { accountId: string; initialNotes: string | null }) {
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setStatus("idle");
    setError(null);
    startTransition(async () => {
      const result = await updateAccountNotesAction(accountId, notes);
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
      <label htmlFor="internal-notes" className="text-xs font-medium text-muted">
        Notas internas (visível só para SuperAdmin)
      </label>
      <textarea
        id="internal-notes"
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          setStatus("idle");
        }}
        rows={3}
        placeholder="ex: cliente piloto, condição especial de exclusividade até 15/08/2026"
        className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-signal"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="w-fit rounded-md border border-surface-border px-3 py-1.5 text-sm text-foreground hover:bg-background disabled:opacity-60"
        >
          {isPending ? "Salvando..." : "Salvar notas"}
        </button>
        {status === "saved" && <span className="text-xs text-sucesso-texto">Salvo.</span>}
        {status === "error" && (
          <span className="text-xs text-erro-texto" role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
