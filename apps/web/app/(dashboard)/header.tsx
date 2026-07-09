"use client";

import { logout } from "@/lib/auth/actions";
import { ThemeToggle } from "./theme-toggle";
import type { UserRole } from "@/lib/supabase/types";

const ROLE_LABEL: Record<UserRole, string> = {
  superadmin: "SuperAdmin",
  admin: "Admin",
  usuario: "Usuário",
};

function initials(fullName: string | null): string {
  if (!fullName) return "?";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase();
}

// Barra utilitária minimalista — a saudação por extenso (Fraunces, com
// personalidade) vive no corpo da página /admin, não aqui, seguindo a
// estrutura de referência (Claude Console: chrome funcional, saudação no
// conteúdo).
export function Header({
  fullName,
  role,
  notificationSlot,
}: {
  fullName: string | null;
  role: UserRole;
  notificationSlot: React.ReactNode;
}) {
  return (
    <header className="print:hidden flex items-center justify-end border-b border-surface-border bg-surface px-6 py-3">
      <div className="flex items-center gap-3">
        {notificationSlot}
        <ThemeToggle />
        <div className="flex items-center gap-2">
          <div
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-full bg-signal/15 text-xs font-semibold text-signal-text"
          >
            {initials(fullName)}
          </div>
          <span className="hidden text-sm text-muted sm:inline">
            {fullName ?? "Sem nome"} · {ROLE_LABEL[role]}
          </span>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-md border border-surface-border px-3 py-1.5 text-sm text-muted hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
          >
            Sair
          </button>
        </form>
      </div>
    </header>
  );
}
