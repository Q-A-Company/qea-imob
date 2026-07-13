"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAccountAction } from "./actions";

// Confirmação mais forte que a palavra fixa usada em DeleteUserButton/
// ClearHistoryButton/ClearErrorRunsButton — aqui exige digitar o NOME da
// própria conta, não uma palavra genérica ("EXCLUIR"). Justificativa:
// apagar uma conta é a ação mais destrutiva do sistema (todo o cliente,
// concorrentes, histórico, usuários) — uma palavra fixa não confirma que o
// SuperAdmin está mesmo olhando pra conta certa; digitar o nome exige
// reler o que está prestes a apagar.
export function DeleteAccountButton({ accountId, accountName }: { accountId: string; accountName: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmText, setConfirmText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function openDialog() {
    setConfirmText("");
    setError(null);
    dialogRef.current?.showModal();
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const response = await deleteAccountAction(accountId);
      if (response.error) {
        setError(response.error);
        return;
      }
      // A conta não existe mais — qualquer tentativa de continuar nesta
      // página (revalidatePath sozinho) bateria em notFound(). Navega pra
      // longe em vez de só fechar o diálogo.
      router.push("/superadmin");
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="w-fit shrink-0 rounded-md border border-erro/40 bg-erro/10 px-3 py-1.5 text-sm text-erro-texto hover:bg-erro/15"
      >
        Apagar conta permanentemente
      </button>
      <dialog
        ref={dialogRef}
        className="rounded-lg border border-surface-border bg-surface p-0 text-foreground backdrop:bg-black/50"
      >
        <div className="flex w-96 flex-col gap-3 p-5">
          <p className="text-sm font-semibold text-foreground">Apagar &quot;{accountName}&quot; permanentemente?</p>
          <p className="text-sm text-muted">
            Apaga TODOS os concorrentes, imóveis capturados, histórico de mudanças, notificações, configurações de extração e
            TODOS os usuários desta conta — ninguém deles vai conseguir logar de novo. Essa ação não pode ser desfeita.
          </p>
          <label htmlFor="confirm-delete-account" className="text-xs text-muted">
            Digite <strong>{accountName}</strong> para confirmar
          </label>
          <input
            id="confirm-delete-account"
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
              disabled={confirmText !== accountName || isPending}
              className="rounded-md bg-erro px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
            >
              {isPending ? "Apagando..." : "Sim, apagar permanentemente"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
