import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { getAccountBanner } from "./get-account-banner";
import { getPendingSiteConfigCount } from "./get-pending-site-configs";
import { getHasNewErrorsForAccount } from "./get-account-error-runs";
import { AccountShellChrome } from "./account-shell-chrome";
import type { AccountNavBadges } from "./account-sidebar";

// Shell próprio, fora de app/(dashboard)/ de propósito — layouts do Next.js
// sempre aninham pela posição real no sistema de arquivos, sem exceção; se
// essas rotas ficassem dentro de (dashboard)/, herdariam a sidebar GLOBAL do
// SuperAdmin (hoje só "Clientes") e qualquer sidebar nova ficaria empilhada
// por cima dela, não no lugar dela. Ficando fora, a URL continua
// /superadmin/accounts/[id]/* (grupo de rotas entre parênteses não afeta
// URL) mas a cadeia de layout é independente — dá pra trocar a navegação
// inteira por uma escopada à conta sem duplicar chrome.
export default async function AccountShellLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const profile = await requireRole("superadmin");
  const { id } = await params;

  // Este layout roda em TODA navegação dentro de uma conta (Configurações,
  // Concorrentes, Usuários, Erros...) — antes disso, getAccountBanner e as
  // duas funções de badge rodavam em sequência (banner primeiro, badges
  // depois), e as duas de badge buscavam "competitors" da conta cada uma
  // por conta própria, de forma redundante. Busca os IDs UMA vez aqui e
  // dispara banner + as duas badges juntos, sem dependência entre si —
  // achado investigando lentidão real navegando como SuperAdmin.
  const cookieStore = await cookies();
  const supabase = await createClient();
  const [account, competitorRows] = await Promise.all([
    getAccountBanner(id),
    supabase.from("competitors").select("id").eq("account_id", id),
  ]);
  if (!account) notFound();
  const competitorIds = (competitorRows.data ?? []).map((c) => c.id);

  // Mesmo cookie "sidebar-pinned" lido em (dashboard)/layout.tsx — uma
  // preferência de UI só, compartilhada entre a navegação por role e esta
  // navegação escopada à conta.
  const sidebarPinned = cookieStore.get("sidebar-pinned")?.value !== "false";

  // Sinalizações da nav (account-sidebar.tsx): "Configurações" acende com
  // revisão de site_config pendente, "Relatório de erros" acende com erro
  // mais novo que a última visita DESTE SuperAdmin a esta conta.
  //
  // SEM await aqui de propósito — a Promise desce até account-sidebar.tsx,
  // que resolve via use() dentro do próprio Suspense de cada badge (ver
  // NavBadgeDot/NavBadgeSrText lá). Antes, esses dois awaits diretos aqui
  // travavam a navegação inteira: como loading.tsx nunca envolve o
  // layout.tsx do mesmo segmento (só page.tsx e layouts aninhados abaixo —
  // documentado em node_modules/next/dist/docs/.../loading.md), qualquer
  // await direto no corpo deste layout segurava {children} junto, mesmo
  // motivo já corrigido pro sino de notificações em (dashboard)/layout.tsx.
  // Isso explicava por que SuperAdmin nunca via o spinner entrando/
  // navegando numa conta, diferente de admin/gerente/usuario.
  const badgesPromise: Promise<AccountNavBadges> = Promise.all([
    getPendingSiteConfigCount(id, competitorIds),
    getHasNewErrorsForAccount(profile.id, id, competitorIds),
  ]).then(([pendingReviewCount, hasNewErrors]) => ({ hasPendingReview: pendingReviewCount > 0, hasNewErrors }));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AccountShellChrome
        accountId={id}
        initialPinned={sidebarPinned}
        fullName={profile.full_name}
        avatarUrl={profile.avatar_url}
        role={profile.role}
        badgesPromise={badgesPromise}
      >
        <div className="print:hidden flex flex-wrap items-center gap-3 border-b border-surface-border bg-signal/10 px-6 py-2 text-sm">
          <span className="text-foreground">
            Visualizando: <strong>{account.name}</strong>
            {!account.active && <span className="ml-2 text-erro-texto">(conta inativa)</span>}
          </span>
          <Link href="/superadmin" className="ml-auto font-medium text-signal-text hover:underline">
            ← Voltar para Clientes
          </Link>
        </div>
        <main className="p-6 print:p-0">{children}</main>
      </AccountShellChrome>
    </div>
  );
}
