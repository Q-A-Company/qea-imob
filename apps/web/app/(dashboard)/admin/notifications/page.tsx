import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { markNotificationReadAction, markAllNotificationsReadAction } from "@/lib/notifications/actions";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}

// Notificações são dado de conta compartilhado (RLS já escopa por
// account_id, não por role) — Admin e Usuario veem a mesma lista completa
// aqui, diferente de Concorrentes/Histórico/Configurações (funções de
// gestão, escopo da Etapa 10, ocultas pra Usuario até a Etapa 11 existir).
export default async function NotificationsPage() {
  const profile = await requireRole(["admin", "usuario"]);
  const supabase = await createClient();

  const { data: notifications, error } = await supabase
    .from("notifications")
    .select("id, title, message, read, created_at")
    .eq("account_id", profile.account_id ?? "")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`Falha ao carregar notificações: ${error.message}`);

  const hasUnread = (notifications ?? []).some((n) => !n.read);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Notificações</h1>
          <p className="mt-1 text-sm text-muted">Últimas 50 notificações da sua conta.</p>
        </div>
        {hasUnread && (
          <form action={markAllNotificationsReadAction}>
            <button type="submit" className="text-sm text-muted hover:underline">
              Marcar todas como lidas
            </button>
          </form>
        )}
      </div>

      {(!notifications || notifications.length === 0) && <p className="mt-6 text-sm text-muted">Nenhuma notificação ainda.</p>}

      {notifications && notifications.length > 0 && (
        <ul className="mt-6 divide-y divide-surface-border rounded-md border border-surface-border bg-surface">
          {notifications.map((n) => (
            <li key={n.id} className={`px-4 py-3 ${n.read ? "" : "bg-signal/5"}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                  <p className="mt-0.5 text-sm text-muted">{n.message}</p>
                  <p className="mt-1 text-[11px] text-muted">{formatDateTime(n.created_at)}</p>
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
    </div>
  );
}
