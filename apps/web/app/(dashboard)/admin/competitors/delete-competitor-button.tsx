"use client";

import { useRef, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteCompetitorPermanentlyAction } from "@/lib/competitors/actions";
import { IconButton } from "../../icon-button";

const DELETE_CONFIRMATION_WORD = "EXCLUIR";

// Segundo nível — mesmo padrão de fricção forte de DeleteUserButton
// (superadmin/accounts/[id]/user-management-table.tsx): <dialog> nativo,
// exige digitar a palavra de confirmação, não só um segundo clique. Só
// aparece na aba Arquivados (competitors-list.tsx) — pra chegar aqui, o
// concorrente já precisa ter sido arquivado antes, fricção adicional em
// cima da fricção do próprio modal.
export function DeleteCompetitorButton({ competitorId, competitorName }: { competitorId: string; competitorName: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmText, setConfirmText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setConfirmText("");
    setError(null);
    dialogRef.current?.showModal();
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteCompetitorPermanentlyAction(competitorId);
      if (result.error) {
        setError(result.error);
      } else {
        dialogRef.current?.close();
      }
    });
  }

  return (
    <>
      <IconButton icon={Trash2} label="Excluir permanentemente" variant="destructive" size="compact" onClick={openDialog} />
      <dialog
        ref={dialogRef}
        className="rounded-lg border border-surface-border bg-surface p-0 text-foreground backdrop:bg-black/50"
      >
        <div className="flex w-96 flex-col gap-3 p-5">
          <p className="text-sm font-semibold text-foreground">Excluir &quot;{competitorName}&quot; permanentemente?</p>
          <p className="text-sm text-muted">
            Isso apaga todo o histórico de preço e, se você cadastrar este concorrente de novo no futuro, a IA precisará
            aprender o site do zero novamente. Diferente de arquivar, essa ação não pode ser desfeita.
          </p>
          <label htmlFor={`confirm-delete-competitor-${competitorId}`} className="text-xs text-muted">
            Digite <strong>{DELETE_CONFIRMATION_WORD}</strong> para confirmar
          </label>
          <input
            id={`confirm-delete-competitor-${competitorId}`}
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
              onClick={handleDelete}
              disabled={confirmText !== DELETE_CONFIRMATION_WORD || isPending}
              className="rounded-md bg-erro px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
            >
              {isPending ? "Excluindo..." : "Sim, excluir definitivamente"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
