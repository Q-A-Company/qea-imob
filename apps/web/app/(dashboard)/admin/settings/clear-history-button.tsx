"use client";

import { useRef, useState, useTransition } from "react";
import { clearAccountHistoryAction } from "./actions";

const CONFIRMATION_WORD = "LIMPAR";

// Mesmo padrão de fricção forte de DeleteUserButton/DeleteCompetitorButton:
// <dialog> nativo, exige digitar a palavra de confirmação, não só um
// segundo clique — apaga permanentemente todo o histórico de mudanças da
// conta, ação sem undo.
export function ClearHistoryButton() {
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
      const response = await clearAccountHistoryAction();
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
        className="w-fit rounded-md border border-erro/40 bg-erro/10 px-3 py-1.5 text-sm text-erro-texto hover:bg-erro/15"
      >
        Limpar histórico de mudanças
      </button>
      <dialog
        ref={dialogRef}
        className="rounded-lg border border-surface-border bg-surface p-0 text-foreground backdrop:bg-black/50"
      >
        <div className="flex w-96 flex-col gap-3 p-5">
          {result !== null ? (
            <>
              <p className="text-sm font-semibold text-foreground">Histórico apagado</p>
              <p className="text-sm text-muted">
                {result} {result === 1 ? "mudança apagada" : "mudanças apagadas"} permanentemente. Os imóveis capturados e a
                configuração de cada concorrente continuam intactos.
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
              <p className="text-sm font-semibold text-foreground">Limpar todo o histórico de mudanças?</p>
              <p className="text-sm text-muted">
                Apaga permanentemente TODAS as mudanças de preço, imóveis adicionados/removidos/reaparecidos registradas de
                TODOS os concorrentes desta conta — o que alimenta o Feed do Painel e a tela de Relatórios. As notificações
                (sino) vinculadas a essas mudanças também são apagadas.
              </p>
              <p className="text-sm text-muted">
                Os imóveis capturados (preço atual, código, status) e a configuração de extração de cada concorrente NÃO são
                afetados — nenhum reaprendizado via IA é disparado. Essa ação não pode ser desfeita.
              </p>
              <label htmlFor="confirm-clear-history" className="text-xs text-muted">
                Digite <strong>{CONFIRMATION_WORD}</strong> para confirmar
              </label>
              <input
                id="confirm-clear-history"
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
