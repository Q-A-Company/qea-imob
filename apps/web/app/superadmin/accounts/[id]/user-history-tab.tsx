import type { AuditLogRow } from "@/lib/audit/get-user-audit-log";
import { formatAuditEvent } from "@/lib/audit/format-event";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR");
}

// Descrição legível vem de formatAuditEvent (lib/audit/format-event.ts) —
// centralizado lá porque qualquer outro lugar que um dia liste eventos de
// audit_log deve usar a mesma formatação, não reimplementar por conta própria.
function describe(row: AuditLogRow): string {
  const actor = row.actorName ?? (row.actorUserId ? "Usuário removido" : "Sistema");
  return `${formatAuditEvent({ actionType: row.actionType, details: row.details })} — por ${actor}`;
}

export function UserHistoryTab({ rows, totalCount }: { rows: AuditLogRow[]; totalCount: number }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">Nenhum evento registrado ainda.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">
        Mostrando {rows.length} de {totalCount} evento(s) mais recente(s).
      </p>
      <ul className="divide-y divide-surface-border rounded-lg border border-surface-border bg-surface">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-foreground">{describe(row)}</span>
              <span className="text-xs text-muted">{formatDateTime(row.createdAt)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
