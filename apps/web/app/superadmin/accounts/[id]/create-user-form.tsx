"use client";

import { useActionState } from "react";
import { ROLE_LABEL, type UserRole } from "@/lib/supabase/types";
import type { CreateUserState } from "@/lib/users/types";

const initialState: CreateUserState = {};

const inputClass =
  "rounded-md border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-signal";

// Cargos que quem cadastra pode atribuir ao criar — mesma hierarquia de
// user-management-table.tsx (assignableRoles): Gerente só cria Corretor,
// sem seletor pra não sugerir que dá pra escolher outra coisa.
function assignableRoles(viewerRole: UserRole): UserRole[] {
  if (viewerRole === "superadmin" || viewerRole === "admin") return ["admin", "gerente", "usuario"];
  return ["usuario"];
}

// action é injetada via prop (não importada direto de "./actions") — mesmo
// motivo do UserManagementTable: este componente serve tanto o SuperAdmin
// (cria em qualquer conta, passa accountId) quanto o Admin/Gerente (cria só
// na própria conta, accountId vem da sessão do lado do servidor — por isso
// aqui é opcional). Senha gerada automaticamente e exibida uma única vez
// (não fica salva em nenhum lugar depois desse retorno) — mesma lógica de
// scripts/create-admin.mjs.
export function CreateUserForm({
  accountId,
  viewerRole,
  action,
}: {
  accountId?: string;
  viewerRole: UserRole;
  action: (prevState: CreateUserState, formData: FormData) => Promise<CreateUserState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const roleOptions = assignableRoles(viewerRole);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-surface-border bg-surface p-4">
      <p className="text-sm font-medium text-foreground">Cadastrar novo usuário</p>
      {accountId && <input type="hidden" name="accountId" value={accountId} />}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="fullName" className="text-xs font-medium text-muted">
            Nome completo
          </label>
          <input id="fullName" name="fullName" required className={inputClass} placeholder="Maria Silva" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-xs font-medium text-muted">
            E-mail
          </label>
          <input id="email" name="email" type="email" required className={inputClass} placeholder="maria@empresa.com.br" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="role" className="text-xs font-medium text-muted">
            Cargo
          </label>
          {roleOptions.length > 1 ? (
            <select id="role" name="role" defaultValue="usuario" className={inputClass}>
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input type="hidden" name="role" value={roleOptions[0]} />
              <p className={`${inputClass} bg-background/50 text-muted`}>{ROLE_LABEL[roleOptions[0]!]}</p>
            </>
          )}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-signal px-4 py-2 text-sm font-semibold text-signal-on hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Criando..." : "Cadastrar usuário"}
        </button>
      </div>

      {state.error && (
        <p className="text-sm text-red-500" role="alert">
          {state.error}
        </p>
      )}

      {state.success && state.tempPassword && (
        <div className="rounded-md border border-signal/40 bg-signal/10 p-3 text-sm">
          <p className="text-foreground">
            Usuário <strong>{state.createdEmail}</strong> criado. Senha temporária (copie agora — não será mostrada de novo):
          </p>
          <code className="mt-1 block w-fit rounded bg-background px-2 py-1 font-mono text-sm text-foreground">
            {state.tempPassword}
          </code>
        </div>
      )}
    </form>
  );
}
