import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth/dal";
import { DashboardChrome } from "./dashboard-chrome";
import { NotificationBellSection } from "./notification-bell-section";

// Header removido (pedido do usuário) — perfil, notificações e sair
// migraram pro rodapé da sidebar (ver sidebar.tsx). Conteúdo de cada
// página começa direto do topo agora, sem barra acima do <main>.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  // SEM requireAcceptedTerms(profile.id) aqui de propósito — chamada
  // direta e sem cache() nesta função (ver lib/legal/terms-gate.ts), e
  // todo page.tsx dentro de (dashboard)/ já chama requireRole(), que faz
  // essa mesma checagem. Como loading.tsx nunca envolve o layout.tsx do
  // MESMO segmento (só page.tsx e layouts aninhados abaixo — mesmo motivo
  // já documentado em notification-bell-section.tsx e no layout de
  // superadmin/accounts/[id]), esse await aqui rodava em toda navegação
  // dentro de (dashboard) sem nunca mostrar o spinner — explicava por que
  // admin/gerente/usuario nunca viam loading.tsx trocando de aba, e
  // dobrava a consulta (layout + requireRole da página) em toda troca.

  // Mesmo padrão do cookie "theme" em app/layout.tsx: decidido no servidor,
  // sem script anti-flash — isso só define o valor INICIAL (evita flash no
  // primeiro paint); o estado interativo depois do clique vive em
  // dashboard-chrome.tsx (client). Fixada é o padrão agora — só recolhe se
  // o usuário desfixar explicitamente (cookie "false").
  const cookieStore = await cookies();
  const sidebarPinned = cookieStore.get("sidebar-pinned")?.value !== "false";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardChrome
        role={profile.role}
        initialPinned={sidebarPinned}
        fullName={profile.full_name}
        avatarUrl={profile.avatar_url}
        notificationBell={
          // Suspense em vez de await direto aqui — ver comentário em
          // notification-bell-section.tsx. Sem isso, este layout (o ponto
          // de entrada de QUALQUER navegação entre páginas do painel)
          // segurava a página inteira até o sino terminar de buscar.
          // fallback null: ícone só aparece quando pronto, sem "pulo" de
          // layout (é position:fixed, não ocupa espaço reservado).
          profile.account_id ? (
            <Suspense fallback={null}>
              <NotificationBellSection accountId={profile.account_id} role={profile.role} />
            </Suspense>
          ) : null
        }
      >
        <main className="p-6 print:p-0">{children}</main>
      </DashboardChrome>
    </div>
  );
}
