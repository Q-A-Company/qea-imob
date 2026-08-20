import { getNotificationBellData } from "./notification-bell";
import { NotificationBellClient } from "./notification-bell-client";
import type { UserRole } from "@/lib/supabase/types";

// Server Component async isolado de propósito — chamado dentro de um
// <Suspense> em layout.tsx, não mais awaited direto no corpo do layout.
// Sem essa separação, a busca do sino bloqueava a navegação inteira: numa
// navegação client-side entre duas páginas que compartilham este layout
// (ex: Relatórios → Concorrentes), o layout é o "ponto de entrada" da
// troca de rota, e QUALQUER await direto no corpo dele atrasa a resposta
// inteira — inclusive {children} (a página nova) — porque loading.tsx só
// envolve page.js/layouts aninhados, nunca o layout.js do mesmo segmento
// (documentado em node_modules/next/dist/docs/.../loading.md, "Good to
// know": sem isso, "navigation blocks until the layout finishes
// rendering"). Isolando a busca aqui, o layout só espera o essencial
// (perfil/autenticação) antes de liberar a página — o sino aparece um
// instante depois, sem segurar o resto.
export async function NotificationBellSection({ accountId, role }: { accountId: string; role: UserRole }) {
  const notificationData = await getNotificationBellData(accountId, role);

  return (
    <div className="fixed right-4 top-4 z-40 print:hidden">
      <NotificationBellClient
        notifications={notificationData.notifications}
        unreadCount={notificationData.unreadCount}
        viewAllHref={notificationData.viewAllHref}
      />
    </div>
  );
}
