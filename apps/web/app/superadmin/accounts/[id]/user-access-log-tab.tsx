import type { LoginAuditRow } from "@/lib/audit/get-user-login-audit";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR");
}

function formatDevice(row: LoginAuditRow): string {
  const browser = [row.browser, row.browserVersion].filter(Boolean).join(" ");
  const os = row.os ?? "SO desconhecido";
  const device = row.isMobile ? "móvel" : "desktop";
  return `${browser || "Navegador desconhecido"} · ${os} · ${device}`;
}

export function UserAccessLogTab({ rows, totalCount }: { rows: LoginAuditRow[]; totalCount: number }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">Nenhum acesso registrado ainda.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">
        Mostrando {rows.length} de {totalCount} acesso(s) mais recente(s).
      </p>
      <ul className="divide-y divide-surface-border rounded-lg border border-surface-border bg-surface">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-foreground">{formatDateTime(row.loggedInAt)}</span>
              <span className="font-mono text-xs text-muted">{row.ipAddress ?? "IP desconhecido"}</span>
            </div>
            <p className="text-xs text-muted">
              {formatDevice(row)}
              {row.screenWidth && row.screenHeight ? ` · ${row.screenWidth}×${row.screenHeight}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
