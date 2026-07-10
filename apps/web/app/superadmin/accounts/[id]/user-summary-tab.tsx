import type { AccountUser } from "@/lib/users/get-account-users";
import { ROLE_LABEL } from "@/lib/supabase/types";

function formatDateTime(value: string | null): string {
  if (!value) return "Nunca";
  return new Date(value).toLocaleString("pt-BR");
}

// birth_date vem como "YYYY-MM-DD" (date, sem hora) — construir a data a
// partir de new Date(string) interpreta como UTC meia-noite, que desloca um
// dia pra trás em fusos negativos (ex: exibe 14 quando o cadastro foi 15).
// Montar a partir das partes evita isso.
function formatBirthDate(value: string | null): string {
  if (!value) return "Não informado";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "Não informado";
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR");
}

export function UserSummaryTab({ user }: { user: AccountUser }) {
  return (
    <dl className="grid grid-cols-1 gap-4 rounded-lg border border-surface-border bg-surface p-4 sm:grid-cols-2">
      <div>
        <dt className="text-xs font-medium text-muted">Cargo</dt>
        <dd className="text-sm text-foreground">{ROLE_LABEL[user.role]}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium text-muted">Status</dt>
        <dd className="text-sm text-foreground">{user.banned ? "Bloqueado" : "Ativo"}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium text-muted">E-mail</dt>
        <dd className="text-sm text-foreground">{user.email ?? "Não encontrado"}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium text-muted">Data de nascimento</dt>
        <dd className="text-sm text-foreground">{formatBirthDate(user.birthDate)}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium text-muted">Cadastrado em</dt>
        <dd className="text-sm text-foreground">{formatDateTime(user.createdAt)}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium text-muted">Último login</dt>
        <dd className="text-sm text-foreground">{formatDateTime(user.lastSignInAt)}</dd>
      </div>
      {user.banned && user.blockReason && (
        <div className="sm:col-span-2">
          <dt className="text-xs font-medium text-muted">Motivo do bloqueio</dt>
          <dd className="text-sm text-foreground">{user.blockReason}</dd>
        </div>
      )}
    </dl>
  );
}
