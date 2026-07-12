"use client";

import { useRef, useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { AccountUser } from "@/lib/users/get-account-users";
import { ROLE_LABEL, type UserRole } from "@/lib/supabase/types";
import { Avatar } from "@/app/(dashboard)/avatar";
import { IconButton } from "@/app/(dashboard)/icon-button";

interface ActionResult {
  error?: string;
  success?: boolean;
}

interface ResetPasswordResult extends ActionResult {
  tempPassword?: string;
  recoveryLink?: string;
}

// Ações injetadas via props (não importadas direto de "./actions") — é o
// que permite este MESMO componente servir tanto o SuperAdmin
// (superadmin/accounts/[id]/users/page.tsx, gerencia qualquer conta) quanto
// o Admin/Gerente (admin/users/page.tsx, só a própria conta): cada página
// adapta sua própria Server Action pra essa assinatura de 2-3 argumentos
// (sem accountId — quem gerencia a própria conta nunca precisa passar isso,
// é derivado da sessão do lado do servidor; o SuperAdmin captura o
// accountId por closure na hora de montar essas props). Reaproveitada
// também pela página de edição (user-edit-content.tsx), que usa a mesma
// UserManagementActions pros controles de Segurança.
export interface UserManagementActions {
  changeRole: (userId: string, newRole: UserRole) => Promise<ActionResult>;
  toggleBan: (userId: string, ban: boolean, reason?: string) => Promise<ActionResult>;
  deleteUser: (userId: string) => Promise<ActionResult>;
  resetPassword: (userId: string, email: string, mode: "temporary" | "link") => Promise<ResetPasswordResult>;
  // Terceira via, ao lado de resetPassword (temporária/link): admin digita a
  // senha diretamente. Separada de resetPassword porque a assinatura é
  // diferente (senha em vez de e-mail/modo) e o retorno não tem
  // tempPassword/recoveryLink pra mostrar.
  setPassword: (userId: string, newPassword: string) => Promise<ActionResult>;
}

const DELETE_CONFIRMATION_WORD = "EXCLUIR";

// compact=true (usado na listagem principal): só o ícone de lixeira.
// compact=false (usado na página de edição, zona de perigo): botão com
// texto — mesmo <dialog> de confirmação nos dois casos.
export function DeleteUserButton({
  user,
  onDelete,
  compact = false,
}: {
  user: AccountUser;
  onDelete: (userId: string) => Promise<ActionResult>;
  compact?: boolean;
}) {
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
      const result = await onDelete(user.id);
      if (result.error) {
        setError(result.error);
      } else {
        dialogRef.current?.close();
      }
    });
  }

  return (
    <>
      {compact ? (
        <IconButton icon={Trash2} label="Excluir usuário" variant="destructive" size="compact" onClick={openDialog} />
      ) : (
        <button
          type="button"
          onClick={openDialog}
          className="w-fit rounded-md border border-erro/40 bg-erro/10 px-3 py-1.5 text-sm text-erro-texto hover:bg-erro/15"
        >
          Excluir usuário
        </button>
      )}
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

// Quem o cargo de quem está vendo a tela pode gerenciar (editar/excluir) —
// SuperAdmin e Diretor/T.I gerenciam qualquer um na conta; Gerente só
// gerencia Corretor (usuario), nunca um par ou superior. Reaproveitada por
// user-edit-content.tsx pra decidir se mostra os controles de Segurança.
export function canManageTarget(viewerRole: UserRole, targetRole: UserRole): boolean {
  if (viewerRole === "superadmin" || viewerRole === "admin") return true;
  if (viewerRole === "gerente") return targetRole === "usuario";
  return false;
}

function UserRow({
  user,
  viewerRole,
  editHref,
  onDelete,
}: {
  user: AccountUser;
  viewerRole: UserRole;
  editHref: string;
  onDelete: (userId: string) => Promise<ActionResult>;
}) {
  const manageable = canManageTarget(viewerRole, user.role);

  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar avatarUrl={user.avatarUrl} fullName={user.fullName} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {user.fullName ?? "Sem nome"}
            <span className="ml-2 text-xs text-muted">{ROLE_LABEL[user.role]}</span>
          </p>
          <p className="truncate text-xs text-muted">{user.email ?? "e-mail não encontrado"}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
            user.banned
              ? "border-erro/30 bg-erro/10 text-erro-texto"
              : "border-sucesso/30 bg-sucesso/10 text-sucesso-texto"
          }`}
        >
          {user.banned ? "Bloqueado" : "Ativo"}
        </span>

        {manageable ? (
          <>
            <IconButton icon={Pencil} label="Editar usuário" size="compact" href={editHref} />
            <DeleteUserButton user={user} onDelete={onDelete} compact />
          </>
        ) : (
          <span className="text-xs text-muted">Fora do seu escopo</span>
        )}
      </div>
    </li>
  );
}

// basePath: "/admin/users" ou "/superadmin/accounts/{id}/users" — cada
// linha vira um link pra "{basePath}/{userId}", a página de edição
// dedicada (não modal, ver user-edit-content.tsx).
export function UserManagementTable({
  users,
  viewerRole,
  basePath,
  actions,
}: {
  users: AccountUser[];
  viewerRole: UserRole;
  basePath: string;
  actions: UserManagementActions;
}) {
  if (users.length === 0) return <p className="text-sm text-muted">Nenhum usuário cadastrado nesta conta ainda.</p>;

  return (
    <ul className="divide-y divide-surface-border rounded-lg border border-surface-border bg-surface">
      {users.map((user) => (
        <UserRow key={user.id} user={user} viewerRole={viewerRole} editHref={`${basePath}/${user.id}`} onDelete={actions.deleteUser} />
      ))}
    </ul>
  );
}
