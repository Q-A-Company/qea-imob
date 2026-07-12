import { createClient } from "@/lib/supabase/server";
import { markNotificationReadAction, markNotificationUnreadAction, markAllNotificationsReadAction } from "@/lib/notifications/actions";
import { CompetitorAvatar } from "../../competitor-avatar";
import { Card } from "../../card";
import { Pagination } from "../../pagination";

// Data/hora real — pedido explícito do usuário, não "há Xh"/"há Xm".
function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
    .select("id, title, message, read, created_at, competitor_id", { count: "exact" })
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .range(offset, offset + NOTIFICATIONS_PAGE_SIZE - 1);

  if (error) throw new Error(`Falha ao carregar notificações: ${error.message}`);

  // Duas queries sequenciais — mesmo motivo de notification-bell.tsx (sem
  // metadados de relacionamento completos no Database type deste projeto).
  const competitorIds = [...new Set((notifications ?? []).map((n) => n.competitor_id).filter((id): id is string => id !== null))];
  const { data: competitors } = competitorIds.length
    ? await supabase.from("competitors").select("id, abbreviation").in("id", competitorIds)
    : { data: [] };
  const abbreviationById = new Map((competitors ?? []).map((c) => [c.id, c.abbreviation]));

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / NOTIFICATIONS_PAGE_SIZE));
  const hasUnread = (notifications ?? []).some((n) => !n.read);

  function buildUrl(p: number): string {
    return `${basePath}?page=${p}`;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* pr-16 reserva o espaço do sino de notificações flutuante (fixed
          right-4 top-4 em dashboard-chrome.tsx) — mesmo ajuste de
          relatorios-content.tsx; sem isso, "Marcar todas como lidas" fica
          embaixo do sino quando a página carrega no topo. */}
      <div className="flex items-start justify-between gap-4 pr-16">
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
            <li key={n.id} className={`flex items-start gap-3 px-4 py-3.5 ${n.read ? "" : "bg-foreground/[0.08]"}`}>
              <CompetitorAvatar competitorId={n.competitor_id} abbreviation={n.competitor_id ? (abbreviationById.get(n.competitor_id) ?? null) : null} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{n.title}</p>
                <p className="mt-0.5 text-sm text-muted">{n.message}</p>
                <div className="mt-1.5 flex items-center gap-3">
                  <span className="whitespace-nowrap text-[11px] text-muted/70">{formatDateTime(n.created_at)}</span>
                  <form action={(n.read ? markNotificationUnreadAction : markNotificationReadAction).bind(null, n.id)}>
                    <button type="submit" className="text-xs text-signal-text hover:underline">
                      {n.read ? "Marcar como não lida" : "Marcar como lida"}
                    </button>
                  </form>
                </div>
              </div>
              {!n.read && <span aria-hidden className="mt-1 h-2 w-2 shrink-0 rounded-full bg-signal" />}
            </li>
          ))}
        </ul>
      )}

      <Pagination page={page} totalPages={totalPages} buildUrl={buildUrl} />
    </div>
  );
}
