"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import type { UserRole } from "@/lib/supabase/types";

// Estado do pin vive AQUI (client), não só no cookie + reload do layout.tsx
// Server Component — a primeira versão dependia de router.refresh() pra
// repropagar o cookie até o Server Component, e isso não atualizava a UI
// de forma confiável nem animava (o <nav> só re-renderizava depois de um
// round-trip completo ao servidor). Guardando o estado localmente, o clique
// atualiza a sidebar E o padding do conteúdo no mesmo render, e as
// transições CSS (ver sidebar.tsx) passam a funcionar de verdade. O cookie
// continua sendo escrito, só que agora serve só pra decidir o valor
// INICIAL na próxima navegação/reload (lido em layout.tsx), não mais pra
// disputar o estado com o React durante a sessão.
export function DashboardChrome({
  role,
  initialPinned,
  children,
}: {
  role: UserRole;
  initialPinned: boolean;
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
      <Sidebar role={role} pinned={pinned} onTogglePin={togglePin} />
      {/* pl-16/pl-56 reserva exatamente a largura atual da sidebar — ela
          expande por cima (overlay, position fixed em sidebar.tsx). transition
          aqui acompanha a animação de largura da própria sidebar, então o
          conteúdo desliza junto em vez de saltar. pb-16 no mobile reserva
          espaço pro bottom nav fixo. */}
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
