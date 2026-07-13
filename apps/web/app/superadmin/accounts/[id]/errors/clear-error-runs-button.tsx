"use client";

import { useRef, useState, useTransition } from "react";
import { clearAccountErrorRunsAction } from "../actions";

const CONFIRMATION_WORD = "LIMPAR";

// Mesmo padrão de fricção forte de ClearHistoryButton (admin/settings) —
// <dialog> nativo, exige digitar a palavra de confirmação: apaga
// permanentemente as execuções com erro desta conta, ação sem undo.
export function ClearErrorRunsButton({ accountId }: { accountId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmText, setConfirmText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<number | null>(null);

  function openDialog() {
    setConfirmText("");
    setError(null);
    setResult(null);
    dialogRef.current?.showModal();
  }

  function handleClear() {
    setError(null);
    startTransition(async () => {
      const response = await clearAccountErrorRunsAction(accountId);
      if (response.error) {
        setError(response.error);
        return;
      }
      setResult(response.deletedCount ?? 0);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="w-fit shrink-0 rounded-md border border-erro/40 bg-erro/10 px-3 py-1.5 text-sm text-erro-texto hover:bg-erro/15"
      >
        Limpar relatório de erros
      </button>
      <dialog
        ref={dialogRef}
        className="rounded-lg border border-surface-border bg-surface p-0 text-foreground backdrop:bg-black/50"
      >
        <div className="flex w-96 flex-col gap-3 p-5">
          {result !== null ? (
            <>
              <p className="text-sm font-semibold text-foreground">Relatório de erros limpo</p>
              <p className="text-sm text-muted">
                {result} {result === 1 ? "execução apagada" : "execuções apagadas"} permanentemente. Execuções bem-sucedidas
                continuam intactas no Histórico.
              </p>
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => dialogRef.current?.close()}
                  className="rounded-md bg-surface-border px-3 py-1.5 text-sm text-foreground hover:opacity-90"
                >
                  Fechar
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-foreground">Limpar o relatório de erros?</p>
              <p className="text-sm text-muted">
                Apaga permanentemente TODAS as execuções que falharam ou pararam cedo por erro, de TODOS os concorrentes desta
                conta.
              </p>
              <p className="text-sm text-muted">
                Execuções bem-sucedidas (Histórico) e as mudanças de preço/disponibilidade já detectadas NÃO são afetadas —
                só o vínculo com qual execução detectou cada uma é desfeito. Nenhum concorrente é reaprendido ou
                recalibrado. Essa ação não pode ser desfeita.
              </p>
              <label htmlFor="confirm-clear-error-runs" className="text-xs text-muted">
                Digite <strong>{CONFIRMATION_WORD}</strong> para confirmar
              </label>
              <input
                id="confirm-clear-error-runs"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm outline-none focus:border-signal"
              />
              {error && (
                <p className="text-xs text-erro-texto" role="alert">
                  {error}
                </p>
              )}
              <div className="flex items-center justify-end gap-3">
                <button type="button" onClick={() => dialogRef.current?.close()} className="text-sm text-muted hover:underline">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={confirmText !== CONFIRMATION_WORD || isPending}
                  className="rounded-md bg-erro px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
                >
                  {isPending ? "Apagando..." : "Sim, apagar permanentemente"}
                </button>
              </div>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
