"use client";

import { useRef, useState, useTransition } from "react";
import type { AccountUser } from "./get-account-users";
import { changeUserRoleAction, deleteUserAction, resetUserPasswordAction, toggleUserBanAction } from "./actions";
import type { UserRole } from "@/lib/supabase/types";

function formatDateTime(value: string | null): string {
  if (!value) return "Nunca";
  return new Date(value).toLocaleString("pt-BR");
}

const DELETE_CONFIRMATION_WORD = "EXCLUIR";

function DeleteUserButton({ user, accountId }: { user: AccountUser; accountId: string }) {
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
      const result = await deleteUserAction(user.id, accountId);
      if (result.error) {
        setError(result.error);
      } else {
        dialogRef.current?.close();
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-sm text-red-500 hover:bg-red-500/15"
      >
        Excluir
      </button>
      {/* <dialog> nativo — sem lib de modal, backdrop e Esc-to-close já vêm
          de graça do navegador. Exclusão exige digitar a palavra de
          confirmação, não só um segundo clique — é destrutiva e não tem
          undo fácil (pedido explícito do usuário). */}
      <dialog
        ref={dialogRef}
        className="rounded-lg border border-surface-border bg-surface p-0 text-foreground backdrop:bg-black/50"
      >
        <div className="flex w-80 flex-col gap-3 p-5">
          <p className="text-sm font-semibold text-foreground">Excluir usuário permanentemente?</p>
          <p className="text-sm text-muted">
            <strong>{user.fullName ?? user.email}</strong> ({user.email}) será removido definitivamente, incluindo o login. Essa
            ação não pode ser desfeita.
          </p>
          <label htmlFor={`confirm-${user.id}`} className="text-xs text-muted">
            Digite <strong>{DELETE_CONFIRMATION_WORD}</strong> para confirmar
          </label>
          <input
            id={`confirm-${user.id}`}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm outline-none focus:border-signal"
          />
          {error && (
            <p className="text-xs text-red-500" role="alert">
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
              className="rounded-md bg-red-500 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
            >
              {isPending ? "Excluindo..." : "Sim, excluir definitivamente"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

function ResetPasswordControls({ user, accountId }: { user: AccountUser; accountId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [recoveryLink, setRecoveryLink] = useState<string | null>(null);

  function handleReset(mode: "temporary" | "link") {
    setError(null);
    setTempPassword(null);
    setRecoveryLink(null);
    startTransition(async () => {
      const result = await resetUserPasswordAction(user.id, accountId, user.email ?? "", mode);
      if (result.error) setError(result.error);
      else if (mode === "temporary") setTempPassword(result.tempPassword ?? null);
      else setRecoveryLink(result.recoveryLink ?? null);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleReset("temporary")}
          disabled={isPending || !user.email}
          className="rounded-md border border-surface-border px-2.5 py-1 text-xs text-foreground hover:bg-background disabled:opacity-60"
        >
          Gerar senha temporária
        </button>
        <button
          type="button"
          onClick={() => handleReset("link")}
          disabled={isPending || !user.email}
          className="rounded-md border border-surface-border px-2.5 py-1 text-xs text-foreground hover:bg-background disabled:opacity-60"
        >
          Gerar link de redefinição
        </button>
      </div>
      {error && (
        <p className="text-[11px] text-red-500" role="alert">
          {error}
        </p>
      )}
      {tempPassword && (
        <p className="text-[11px] text-foreground">
          Senha temporária (copie agora): <code className="rounded bg-background px-1 py-0.5 font-mono">{tempPassword}</code>
        </p>
      )}
      {recoveryLink && (
        <p className="max-w-72 truncate text-[11px] text-foreground" title={recoveryLink}>
          Link (copie e envie manualmente — e-mail automático ainda não está ativo):{" "}
          <code className="rounded bg-background px-1 py-0.5 font-mono">{recoveryLink}</code>
        </p>
      )}
    </div>
  );
}

function UserRow({ user, accountId }: { user: AccountUser; accountId: string }) {
  const [isBanPending, startBanTransition] = useTransition();
  const [isRolePending, startRoleTransition] = useTransition();
  const [banError, setBanError] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);

  function handleToggleBan() {
    setBanError(null);
    startBanTransition(async () => {
      const result = await toggleUserBanAction(user.id, accountId, !user.banned);
      if (result.error) setBanError(result.error);
    });
  }

  function handleRoleChange(newRole: UserRole) {
    setRoleError(null);
    startRoleTransition(async () => {
      const result = await changeUserRoleAction(user.id, accountId, newRole);
      if (result.error) setRoleError(result.error);
    });
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {user.fullName ?? "Sem nome"}
          {user.banned && (
            <span className="ml-2 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-500">DESATIVADO</span>
          )}
        </p>
        <p className="truncate text-xs text-muted">{user.email ?? "e-mail não encontrado"}</p>
        <p className="mt-0.5 text-xs text-muted">
          Criado em {formatDateTime(user.createdAt)} · Último login: {formatDateTime(user.lastSignInAt)}
        </p>
        <div className="mt-2">
          <ResetPasswordControls user={user} accountId={accountId} />
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          <select
            value={user.role}
            disabled={isRolePending}
            onChange={(e) => handleRoleChange(e.target.value as UserRole)}
            className="rounded-md border border-surface-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-signal disabled:opacity-60"
          >
            <option value="admin">Admin</option>
            <option value="usuario">Usuario</option>
          </select>
          <button
            type="button"
            onClick={handleToggleBan}
            disabled={isBanPending}
            className={`rounded-md border px-2.5 py-1 text-xs disabled:opacity-60 ${
              user.banned
                ? "border-green-600/40 bg-green-600/10 text-green-600 hover:bg-green-600/15 dark:border-green-400/40 dark:bg-green-400/10 dark:text-green-400"
                : "border-amber-600/40 bg-amber-600/10 text-amber-600 hover:bg-amber-600/15 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-400"
            }`}
          >
            {isBanPending ? "Aguarde..." : user.banned ? "Reativar" : "Desativar"}
          </button>
          <DeleteUserButton user={user} accountId={accountId} />
        </div>
        {roleError && (
          <p className="text-[11px] text-red-500" role="alert">
            {roleError}
          </p>
        )}
        {banError && (
          <p className="text-[11px] text-red-500" role="alert">
            {banError}
          </p>
        )}
      </div>
    </li>
  );
}

export function UserManagementTable({ users, accountId }: { users: AccountUser[]; accountId: string }) {
  if (users.length === 0) return <p className="text-sm text-muted">Nenhum usuário cadastrado nesta conta ainda.</p>;

  return (
    <ul className="divide-y divide-surface-border rounded-md border border-surface-border bg-surface">
      {users.map((user) => (
        <UserRow key={user.id} user={user} accountId={accountId} />
      ))}
    </ul>
  );
}
