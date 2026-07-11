"use client";

import { useState } from "react";
import { AccountSidebar } from "./account-sidebar";
import { AutoRefresh } from "@/app/(dashboard)/auto-refresh";
import type { UserRole } from "@/lib/supabase/types";

// Espelha (dashboard)/dashboard-chrome.tsx — mesmo raciocínio de estado
// vivendo no client (não só cookie + reload) pra clique atualizar sidebar e
// padding do conteúdo no mesmo render, com as transições CSS funcionando de
// verdade. Reaproveita o MESMO cookie "sidebar-pinned" do resto do app: é
// uma preferência de UI do usuário, não escopada a esta conta específica.
export function AccountShellChrome({
  accountId,
  initialPinned,
  fullName,
  avatarUrl,
  role,
  children,
}: {
  accountId: string;
  initialPinned: boolean;
  fullName: string | null;
  avatarUrl: string | null;
  role: UserRole;
  children: React.ReactNode;
}) {
  const [pinned, setPinned] = useState(initialPinned);

  function togglePin() {
    setPinned((current) => {
      const next = !current;
      document.cookie = `sidebar-pinned=${next}; path=/; max-age=31536000; SameSite=Lax`;
      return next;
    });
  }

  return (
    <>
      <AutoRefresh />
      <AccountSidebar
        accountId={accountId}
        pinned={pinned}
        onTogglePin={togglePin}
        fullName={fullName}
        avatarUrl={avatarUrl}
        role={role}
      />
      <div
        className={`pb-16 transition-[padding-left] duration-200 ease-out md:pb-0 print:pb-0 print:pl-0 ${
          pinned ? "md:pl-56" : "md:pl-16"
        }`}
      >
        {children}
      </div>
    </>
  );
}
