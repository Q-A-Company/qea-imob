"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { markNotificationReadAction, markAllNotificationsReadAction } from "@/lib/notifications/actions";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}

export function NotificationBellClient({
  notifications,
  unreadCount,
  viewAllHref,
}: {
  notifications: NotificationItem[];
  unreadCount: number;
  viewAllHref: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notificações"
        className="relative rounded-md border border-surface-border p-2 text-muted hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-signal px-1 text-[10px] font-semibold text-signal-on">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Fechar notificações"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-surface-border bg-surface shadow-lg">
            <div className="flex items-center justify-between border-b border-surface-border px-3 py-2.5">
              <span className="text-sm font-semibold text-foreground">Notificações</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => startTransition(() => markAllNotificationsReadAction())}
                  className="text-xs text-muted hover:text-foreground hover:underline disabled:opacity-60"
                >
                  Marcar todas como lidas
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 && <p className="px-3 py-4 text-sm text-muted">Nenhuma notificação ainda.</p>}
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  disabled={pending || n.read}
                  onClick={() => startTransition(() => markNotificationReadAction(n.id))}
                  className={`block w-full border-b border-surface-border px-3 py-2.5 text-left last:border-b-0 ${
                    n.read ? "" : "bg-signal/5"
                  } hover:bg-background`}
                >
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{n.message}</p>
                  <p className="mt-1 text-[11px] text-muted/70">{formatDateTime(n.created_at)}</p>
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
    </div>
  );
}
