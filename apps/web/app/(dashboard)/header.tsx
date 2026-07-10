"use client";

import Link from "next/link";
import { logout } from "@/lib/auth/actions";
import { ThemeToggle } from "./theme-toggle";
import { Avatar } from "./avatar";
import { ROLE_LABEL, type UserRole } from "@/lib/supabase/types";

// Barra utilitária minimalista — a saudação por extenso (Fraunces, com
// personalidade) vive no corpo da página /admin, não aqui, seguindo a
// estrutura de referência (Claude Console: chrome funcional, saudação no
// conteúdo).
export function Header({
  fullName,
  role,
  avatarUrl,
  notificationSlot,
}: {
  fullName: string | null;
  role: UserRole;
  avatarUrl: string | null;
  notificationSlot: React.ReactNode;
}) {
  return (
    <header className="print:hidden flex items-center justify-end border-b border-surface-border bg-surface px-6 py-3">
      <div className="flex items-center gap-3">
        {notificationSlot}
        <ThemeToggle />
        {/* Leva pro próprio perfil (/profile) — rota única compartilhada
            por todos os cargos, ver app/(dashboard)/profile/page.tsx. */}
        <Link
          href="/profile"
          className="flex items-center gap-2 rounded-md p-1 hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        >
          <Avatar avatarUrl={avatarUrl} fullName={fullName} size="sm" />
          <span className="hidden text-sm text-muted sm:inline">
            {fullName ?? "Sem nome"} · {ROLE_LABEL[role]}
          </span>
        </Link>
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
