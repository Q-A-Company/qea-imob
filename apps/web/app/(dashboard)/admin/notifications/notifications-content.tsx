import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { markNotificationReadAction, markAllNotificationsReadAction } from "@/lib/notifications/actions";
import { Card } from "../../card";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}

export const NOTIFICATIONS_PAGE_SIZE = 30;

// Compartilhado entre /admin/notifications e /user/notifications (Etapa
// 11). Marcar como lida não é uma ação de "gestão" no sentido que
// justificaria escondê-la de Usuario — é a própria conta lendo suas
// próprias notificações, RLS já escopa por account_id, não por role (regra
// já estabelecida desde a Etapa 8).
//
// Paginação real (.range() + count), não mais um .limit(50) fixo — essa
// página é o "histórico completo" prometido no dropdown do sino (que só
// mostra as 10 mais recentes), então precisa ir além de uma primeira
// página curta. Mesmo padrão de get-account-error-runs.ts.
export async function NotificationsContent({
  accountId,
  page,
  basePath,
}: {
  accountId: string;
  page: number;
  basePath: string;
}) {
  const supabase = await createClient();
  const offset = (page - 1) * NOTIFICATIONS_PAGE_SIZE;

  const {
    data: notifications,
    error,
    count,
  } = await supabase
    .from("notifications")
    .select("id, title, message, read, created_at", { count: "exact" })
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .range(offset, offset + NOTIFICATIONS_PAGE_SIZE - 1);

  if (error) throw new Error(`Falha ao carregar notificações: ${error.message}`);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / NOTIFICATIONS_PAGE_SIZE));
  const hasUnread = (notifications ?? []).some((n) => !n.read);

  function buildUrl(p: number): string {
    return `${basePath}?page=${p}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Notificações</h1>
          <p className="mt-1 text-sm text-muted">Histórico completo de notificações da sua conta.</p>
        </div>
        {hasUnread && (
          <form action={markAllNotificationsReadAction}>
            <button type="submit" className="text-sm text-muted hover:text-foreground hover:underline">
              Marcar todas como lidas
            </button>
          </form>
        )}
      </div>

      {(!notifications || notifications.length === 0) && (
        <Card>
          <p className="text-sm text-muted">Nenhuma notificação ainda.</p>
        </Card>
      )}

      {notifications && notifications.length > 0 && (
        <ul className="divide-y divide-surface-border rounded-lg border border-surface-border bg-surface">
          {notifications.map((n) => (
            <li key={n.id} className={`px-4 py-3.5 ${n.read ? "" : "bg-signal/5"}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                  <p className="mt-0.5 text-sm text-muted">{n.message}</p>
                  <p className="mt-1 text-[11px] text-muted/70">{formatDateTime(n.created_at)}</p>
                </div>
                {!n.read && (
                  <form action={markNotificationReadAction.bind(null, n.id)}>
                    <button type="submit" className="shrink-0 text-xs text-signal-text hover:underline">
                      Marcar como lida
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Link
            href={buildUrl(Math.max(1, page - 1))}
            aria-disabled={page <= 1}
            className={`text-sm ${page <= 1 ? "pointer-events-none text-muted/40" : "text-muted hover:underline"}`}
          >
            ‹ Anterior
          </Link>
          <span className="text-sm text-muted">
            Página {page} de {totalPages}
          </span>
          <Link
            href={buildUrl(Math.min(totalPages, page + 1))}
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
