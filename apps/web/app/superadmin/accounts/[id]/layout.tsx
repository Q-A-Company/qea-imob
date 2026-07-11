import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { getAccountBanner } from "./get-account-banner";
import { AccountShellChrome } from "./account-shell-chrome";

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
  const account = await getAccountBanner(id);
  if (!account) notFound();

  // Mesmo cookie "sidebar-pinned" lido em (dashboard)/layout.tsx — uma
  // preferência de UI só, compartilhada entre a navegação por role e esta
  // navegação escopada à conta.
  const cookieStore = await cookies();
  const sidebarPinned = cookieStore.get("sidebar-pinned")?.value !== "false";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AccountShellChrome
        accountId={id}
        initialPinned={sidebarPinned}
        fullName={profile.full_name}
        avatarUrl={profile.avatar_url}
        role={profile.role}
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
