"use client";

import { useState, useTransition } from "react";
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
}: {
  notifications: NotificationItem[];
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notificações"
        className="relative rounded-md border border-neutral-300 p-2 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
          <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6v-5a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-1.71 1.71A1 1 0 0 0 4 19.5h16a1 1 0 0 0 .71-1.79Z" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-medium text-white">
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
          <div className="absolute right-0 z-20 mt-2 w-80 rounded-md border border-neutral-200 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
              <span className="text-sm font-medium text-neutral-900 dark:text-neutral-50">Notificações</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => startTransition(() => markAllNotificationsReadAction())}
                  className="text-xs text-neutral-500 hover:underline disabled:opacity-60 dark:text-neutral-400"
                >
                  Marcar todas como lidas
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 && (
                <p className="px-3 py-4 text-sm text-neutral-500 dark:text-neutral-400">Nenhuma notificação ainda.</p>
              )}
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  disabled={pending || n.read}
                  onClick={() => startTransition(() => markNotificationReadAction(n.id))}
                  className={`block w-full border-b border-neutral-100 px-3 py-2 text-left last:border-b-0 dark:border-neutral-800 ${
                    n.read ? "" : "bg-blue-50 dark:bg-blue-950/30"
                  } hover:bg-neutral-50 dark:hover:bg-neutral-800`}
                >
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{n.title}</p>
                  <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">{n.message}</p>
                  <p className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">{formatDateTime(n.created_at)}</p>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
