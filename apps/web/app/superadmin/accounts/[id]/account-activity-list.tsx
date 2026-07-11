import Link from "next/link";
import type { AccountAuditLogRow } from "@/lib/audit/get-account-audit-log";
import { ACCOUNT_ACTIVITY_PAGE_SIZE } from "@/lib/audit/get-account-audit-log";
import { formatAuditEvent } from "@/lib/audit/format-event";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR");
}

// Mesma composição de user-history-tab.tsx (descrição legível via
// formatAuditEvent + nome do ator) — centralizado lá de propósito, não
// reimplementado aqui.
function describe(row: AccountAuditLogRow): string {
  const actor = row.actorName ?? (row.actorUserId ? "Usuário removido" : "Sistema");
  return `${formatAuditEvent({ actionType: row.actionType, details: row.details })} — por ${actor}`;
}

// Server Component puro — paginação via <Link> mudando ?page= na URL, sem
// estado client (mesmo padrão de report-table.tsx em Relatórios).
export function AccountActivityList({
  rows,
  totalCount,
  page,
  buildUrl,
}: {
  rows: AccountAuditLogRow[];
  totalCount: number;
  page: number;
  buildUrl: (overrides: Record<string, string>) => string;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / ACCOUNT_ACTIVITY_PAGE_SIZE));

  if (rows.length === 0) {
    return <p className="text-sm text-muted">Nenhuma atividade registrada nesta conta ainda.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">{totalCount} evento(s) no total (login/logout não contam aqui).</p>

      <ul className="divide-y divide-surface-border rounded-lg border border-surface-border bg-surface">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm font-medium text-foreground">{describe(row)}</span>
            <span className="shrink-0 text-xs text-muted">{formatDateTime(row.createdAt)}</span>
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Link
            href={buildUrl({ page: String(Math.max(1, page - 1)) })}
            aria-disabled={page <= 1}
            className={`text-sm ${page <= 1 ? "pointer-events-none text-muted/40" : "text-muted hover:underline"}`}
          >
            ‹ Anterior
          </Link>
          <span className="text-sm text-muted">
            Página {page} de {totalPages}
          </span>
          <Link
            href={buildUrl({ page: String(Math.min(totalPages, page + 1)) })}
            aria-disabled={page >= totalPages}
            className={`text-sm ${page >= totalPages ? "pointer-events-none text-muted/40" : "text-muted hover:underline"}`}
          >
            Próxima ›
          </Link>
        </div>
      )}
    </div>
  );
}
