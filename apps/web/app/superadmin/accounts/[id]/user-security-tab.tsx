"use client";

import { useState, useTransition } from "react";
import type { AccountUser } from "@/lib/users/get-account-users";
import { ROLE_LABEL, type UserRole } from "@/lib/supabase/types";
import { DeleteUserButton, type UserManagementActions } from "./user-management-table";

// Mesma hierarquia de user-management-table.tsx/create-user-form.tsx:
// Gerente não atribui cargo nenhum (não aparece seletor pra ele).
function assignableRoles(viewerRole: UserRole): UserRole[] {
  if (viewerRole === "superadmin" || viewerRole === "admin") return ["admin", "gerente", "usuario"];
  return [];
}

function ResetPasswordControls({
  user,
  onReset,
}: {
  user: AccountUser;
  onReset: (userId: string, email: string, mode: "temporary" | "link") => Promise<{ error?: string; tempPassword?: string; recoveryLink?: string }>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [recoveryLink, setRecoveryLink] = useState<string | null>(null);

  function handleReset(mode: "temporary" | "link") {
    setError(null);
    setTempPassword(null);
    setRecoveryLink(null);
    startTransition(async () => {
      const result = await onReset(user.id, user.email ?? "", mode);
      if (result.error) setError(result.error);
      else if (mode === "temporary") setTempPassword(result.tempPassword ?? null);
      else setRecoveryLink(result.recoveryLink ?? null);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => handleReset("temporary")}
          disabled={isPending || !user.email}
          className="rounded-md border border-surface-border px-3 py-1.5 text-sm text-foreground hover:bg-background disabled:opacity-60"
        >
          Gerar senha temporária
        </button>
        <button
          type="button"
          onClick={() => handleReset("link")}
          disabled={isPending || !user.email}
          className="rounded-md border border-surface-border px-3 py-1.5 text-sm text-foreground hover:bg-background disabled:opacity-60"
        >
          Gerar link de redefinição
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-500" role="alert">
          {error}
        </p>
      )}
      {tempPassword && (
        <p className="text-xs text-foreground">
          Senha temporária (copie agora): <code className="rounded bg-background px-1.5 py-0.5 font-mono">{tempPassword}</code>
        </p>
      )}
      {recoveryLink && (
        <p className="max-w-md truncate text-xs text-foreground" title={recoveryLink}>
          Link (copie e envie manualmente — e-mail automático ainda não está ativo):{" "}
          <code className="rounded bg-background px-1.5 py-0.5 font-mono">{recoveryLink}</code>
        </p>
      )}
    </div>
  );
}

// Terceira via, ao lado das duas acima: admin digita a senha diretamente
// (ex: repassando por telefone), em vez de gerar algo aleatório ou um link.
function SetPasswordControls({
  userId,
  onSetPassword,
}: {
  userId: string;
  onSetPassword: (userId: string, newPassword: string) => Promise<{ error?: string; success?: boolean }>;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    startTransition(async () => {
      const result = await onSetPassword(userId, newPassword);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        setNewPassword("");
        setConfirmPassword("");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:max-w-sm">
      <div className="flex flex-wrap gap-2">
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Nova senha"
          minLength={8}
          required
          className="min-w-0 flex-1 rounded-md border border-surface-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-signal"
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirmar senha"
          minLength={8}
          required
          className="min-w-0 flex-1 rounded-md border border-surface-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-signal"
        />
        <button
          type="submit"
          disabled={isPending}
          className="w-fit rounded-md border border-surface-border px-3 py-1.5 text-sm text-foreground hover:bg-background disabled:opacity-60"
        >
          {isPending ? "Salvando..." : "Definir senha"}
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-500" role="alert">
          {error}
        </p>
      )}
      {success && <p className="text-xs text-green-600 dark:text-green-400">Senha definida.</p>}
    </form>
  );
}

// Aba Segurança da tela de GESTÃO (admin/gerente/superadmin editando OUTRO
// usuário): cargo, bloqueio+motivo, redefinir senha, excluir. Extraída de
// user-edit-content.tsx pra poder ser reaproveitada por ele SEM ser
// reaproveitada pelo perfil próprio (/profile) — self-security-tab.tsx é o
// equivalente restrito, só com "trocar minha senha", sem nenhuma dessas
// quatro ações (não é a mesma tela com partes escondidas: é outro
// componente, que simplesmente não tem código capaz de mudar cargo/bloquear/
// excluir — ver self-security-tab.tsx).
export function UserSecurityTab({
  user,
  viewerRole,
  actions,
}: {
  user: AccountUser;
  viewerRole: UserRole;
  actions: UserManagementActions;
}) {
  const [isBanPending, startBanTransition] = useTransition();
  const [isRolePending, startRoleTransition] = useTransition();
  const [banError, setBanError] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  // Motivo do bloqueio — texto livre, NUNCA obrigatório (pedido explícito).
  const [banReason, setBanReason] = useState(user.blockReason ?? "");

  const roleOptions = assignableRoles(viewerRole);

  function handleToggleBan() {
    setBanError(null);
    startBanTransition(async () => {
      const result = await actions.toggleBan(user.id, !user.banned, banReason);
      if (result.error) setBanError(result.error);
    });
  }

  function handleRoleChange(newRole: UserRole) {
    setRoleError(null);
    startRoleTransition(async () => {
      const result = await actions.changeRole(user.id, newRole);
      if (result.error) setRoleError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {roleOptions.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg border border-surface-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-foreground">Cargo</h2>
          <select
            value={user.role}
            disabled={isRolePending}
            onChange={(e) => handleRoleChange(e.target.value as UserRole)}
            className="w-fit rounded-md border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-signal disabled:opacity-60"
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          {roleError && (
            <p className="text-xs text-red-500" role="alert">
              {roleError}
            </p>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2 rounded-lg border border-surface-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">Acesso</h2>
        {!user.banned && (
          <div className="flex flex-col gap-1">
            <label htmlFor="banReason" className="text-xs font-medium text-muted">
              Motivo do bloqueio (opcional)
            </label>
            <input
              id="banReason"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="ex: solicitado por RH, afastamento, saiu da empresa..."
              className="w-full max-w-md rounded-md border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-signal"
            />
          </div>
        )}
        {user.banned && user.blockReason && <p className="text-xs text-muted">Motivo registrado: {user.blockReason}</p>}
        <button
          type="button"
          onClick={handleToggleBan}
          disabled={isBanPending}
          className={`w-fit rounded-md border px-3 py-1.5 text-sm disabled:opacity-60 ${
            user.banned
              ? "border-green-600/40 bg-green-600/10 text-green-600 hover:bg-green-600/15 dark:border-green-400/40 dark:bg-green-400/10 dark:text-green-400"
              : "border-amber-600/40 bg-amber-600/10 text-amber-600 hover:bg-amber-600/15 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-400"
          }`}
        >
          {isBanPending ? "Aguarde..." : user.banned ? "Reativar acesso" : "Bloquear acesso"}
        </button>
        {banError && (
          <p className="text-xs text-red-500" role="alert">
            {banError}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-surface-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">Redefinir senha</h2>
        <SetPasswordControls userId={user.id} onSetPassword={actions.setPassword} />
        <ResetPasswordControls user={user} onReset={actions.resetPassword} />
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
        <h2 className="text-sm font-semibold text-foreground">Excluir usuário</h2>
        <p className="text-xs text-muted">Remove o cadastro e o login permanentemente. Não pode ser desfeito.</p>
        <DeleteUserButton user={user} onDelete={actions.deleteUser} />
      </section>
    </div>
  );
}
