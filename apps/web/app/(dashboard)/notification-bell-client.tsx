"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { markNotificationReadAction, markNotificationUnreadAction, markAllNotificationsReadAction } from "@/lib/notifications/actions";
import { CompetitorAvatar } from "./competitor-avatar";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  competitorId: string | null;
  competitorAbbreviation: string | null;
}

// Data/hora real — pedido explícito do usuário, não "há Xh"/"há Xm"
// (formatRelativeTime, usado antes). Sem segundos aqui (compacto demais
// pro espaço do dropdown com segundos incluídos).
function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PANEL_WIDTH = 320;
const VIEWPORT_MARGIN = 12;

// Sino flutuante no canto superior direito (fora da sidebar agora — ver
// dashboard-chrome.tsx) — sem faixa/header por trás pra dar contexto
// visual, por isso o botão tem sua própria borda/sombra. Painel abre pra
// BAIXO (o gatilho fica no topo da tela, diferente de quando vivia no
// rodapé da sidebar) via position:fixed calculado em JS a partir do rect
// do botão — não depende de nenhum ancestral com overflow, mas mantém a
// mesma técnica por consistência e porque escapa de qualquer clipping
// futuro sem precisar revisitar isso.
export function NotificationBellClient({
  notifications: initialNotifications,
  unreadCount: initialUnreadCount,
  viewAllHref,
}: {
  notifications: NotificationItem[];
  unreadCount: number;
  viewAllHref: string;
}) {
  // AutoRefresh (auto-refresh.tsx, montado uma vez no shell) chama
  // router.refresh() periodicamente, o que re-busca notificationData no
  // layout.tsx (Server Component) e manda props novas pra cá. Sem
  // ressincronizar, useState(initialNotifications) só leria a prop na
  // primeira montagem e ignoraria toda atualização seguinte (React trata o
  // valor inicial de useState como descartável depois do primeiro render).
  // "Ajustar estado durante a renderização" (comparar com a prop anterior e
  // chamar setState no CORPO do componente, não num useEffect) é o padrão
  // recomendado pelo React pra isso — atualiza antes do commit na tela, sem
  // o round-trip extra de um efeito nem o aviso de "cascading renders" que
  // setState dentro de useEffect dispara.
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [prevInitialNotifications, setPrevInitialNotifications] = useState(initialNotifications);
  const [prevInitialUnreadCount, setPrevInitialUnreadCount] = useState(initialUnreadCount);
  if (initialNotifications !== prevInitialNotifications) {
    setPrevInitialNotifications(initialNotifications);
    setNotifications(initialNotifications);
  }
  if (initialUnreadCount !== prevInitialUnreadCount) {
    setPrevInitialUnreadCount(initialUnreadCount);
    setUnreadCount(initialUnreadCount);
  }

  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<{ top: number; right: number } | null>(null);
  const [isPending, startTransition] = useTransition();
  const buttonRef = useRef<HTMLButtonElement>(null);

  function handleOpen() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const right = Math.max(window.innerWidth - rect.right, VIEWPORT_MARGIN);
      const top = rect.bottom + 8;
      setPanelStyle({ top, right });
    }
    setOpen((v) => !v);
  }

  // Atualização otimista local — não espera o próximo ciclo de polling
  // (até 15s) pra refletir o clique de quem está usando o sino agora.
  function handleToggleRead(notification: NotificationItem) {
    const nextRead = !notification.read;
    setNotifications((current) => current.map((n) => (n.id === notification.id ? { ...n, read: nextRead } : n)));
    setUnreadCount((current) => Math.max(0, current + (nextRead ? -1 : 1)));
    startTransition(() => (notification.read ? markNotificationUnreadAction(notification.id) : markNotificationReadAction(notification.id)));
  }

  function handleMarkAllRead() {
    setNotifications((current) => current.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    startTransition(() => markAllNotificationsReadAction());
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleOpen}
        aria-label="Notificações"
        aria-expanded={open}
        className="relative flex items-center justify-center rounded-full border border-surface-border bg-surface p-2.5 text-muted shadow-sm hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-signal px-1 text-[10px] font-semibold text-signal-on">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && panelStyle && (
        <>
          <button
            type="button"
            aria-label="Fechar notificações"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            style={{ position: "fixed", top: panelStyle.top, right: panelStyle.right, width: PANEL_WIDTH }}
            className="z-50 rounded-lg border border-surface-border bg-surface shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-surface-border px-3 py-2.5">
              <span className="text-sm font-semibold text-foreground">Notificações</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleMarkAllRead}
                  className="text-xs text-muted hover:text-foreground hover:underline disabled:opacity-60"
                >
                  Marcar todas como lidas
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto overflow-x-hidden">
              {notifications.length === 0 && <p className="px-3 py-4 text-sm text-muted">Nenhuma notificação ainda.</p>}
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  disabled={isPending}
                  title={n.read ? "Marcar como não lida" : "Marcar como lida"}
                  onClick={() => handleToggleRead(n)}
                  className={`flex w-full items-start gap-2.5 border-b border-surface-border px-3 py-3 text-left last:border-b-0 disabled:opacity-60 ${
                    n.read ? "" : "bg-foreground/[0.08]"
                  } hover:bg-background`}
                >
                  <CompetitorAvatar competitorId={n.competitorId} abbreviation={n.competitorAbbreviation} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{n.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{n.message}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
                    {!n.read && <span aria-hidden className="h-2 w-2 rounded-full bg-signal" />}
                    <span className="whitespace-nowrap text-[11px] text-muted/70">{formatDateTime(n.created_at)}</span>
                  </div>
                </button>
              ))}
            </div>

            <Link
              href={viewAllHref}
              onClick={() => setOpen(false)}
              className="block border-t border-surface-border px-3 py-2.5 text-center text-xs font-medium text-signal-text hover:bg-background"
            >
              Ver todas as notificações
            </Link>
          </div>
        </>
      )}
    </>
  );
}
