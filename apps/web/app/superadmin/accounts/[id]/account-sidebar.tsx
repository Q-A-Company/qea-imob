"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Ícones duplicados de (dashboard)/sidebar.tsx de propósito, não
// importados/exportados de lá — essa sidebar navega por accountId (rota
// escoped a uma conta específica que o SuperAdmin está visualizando), não
// por role. É um conceito de navegação diferente o suficiente (itens e
// hrefs não têm nada em comum com buildNavItems) que acoplar os dois só
// pra reaproveitar 4 SVGs pequenos não compensa — mesmo raciocínio já usado
// pra duplicar ROLE_HOME entre dal.ts e sidebar.tsx.
function PulseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      <path d="M2 12h4l2.5-7L13 19l2.5-7H22" />
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      <path d="M9 3h6l5 5v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M9 12h6M9 16h6M9 8h2" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.36.24.75.24 1.15V10a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

interface NavItem {
  key: string;
  label: string;
  icon: () => React.ReactElement;
  href: string;
}

function buildAccountNavItems(accountId: string): NavItem[] {
  const base = `/superadmin/accounts/${accountId}`;
  return [
    { key: "painel", label: "Painel", icon: PulseIcon, href: base },
    { key: "relatorios", label: "Relatórios", icon: ReportIcon, href: `${base}/relatorios` },
    { key: "concorrentes", label: "Concorrentes", icon: TargetIcon, href: `${base}/competitors` },
    { key: "usuarios", label: "Usuários", icon: UsersIcon, href: `${base}/users` },
    { key: "configuracoes", label: "Configurações", icon: GearIcon, href: `${base}/settings` },
    { key: "erros", label: "Relatório de erros", icon: AlertIcon, href: `${base}/errors` },
  ];
}

// event.detail é a contagem de cliques do mouse — mesma lógica de
// (dashboard)/sidebar.tsx (blurOnMouseClick), evita a sidebar ficar presa
// expandida por :focus-within depois de um clique de mouse.
function blurOnMouseClick(e: React.MouseEvent<HTMLAnchorElement>) {
  if (e.detail !== 0) {
    e.currentTarget.blur();
  }
}

// Mesma estrutura visual/interação de (dashboard)/sidebar.tsx (overlay que
// expande no hover/foco, nunca empurra o conteúdo) — só os itens mudam:
// aqui a navegação é escopada a uma conta específica (Painel/Relatórios/
// Concorrentes/Usuários/Configurações/Relatório de erros), não por role.
export function AccountSidebar({ accountId }: { accountId: string }) {
  const pathname = usePathname();
  const items = buildAccountNavItems(accountId);

  return (
    <>
      <nav
        aria-label="Navegação da conta"
        className="print:hidden group fixed inset-y-0 left-0 z-30 hidden w-16 flex-col gap-1 overflow-hidden border-r border-surface-border bg-surface py-4 transition-[width] duration-200 ease-out hover:w-56 focus-within:w-56 md:flex"
      >
        <div className="mb-3 flex items-center gap-3 px-3 text-signal-text">
          <PulseIcon />
          <span className="whitespace-nowrap text-sm font-semibold opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
            Q&amp;A Imob
          </span>
        </div>
        <ul className="flex flex-col gap-1 px-2">
          {items.map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  onClick={blurOnMouseClick}
                  className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
                    active ? "bg-signal/10 text-signal-text" : "text-muted hover:bg-background hover:text-foreground"
                  }`}
                >
                  <item.icon />
                  <span className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <nav
        aria-label="Navegação da conta"
        className="print:hidden fixed inset-x-0 bottom-0 z-30 flex border-t border-surface-border bg-surface py-1 md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-label={item.label}
              onClick={blurOnMouseClick}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-md py-1.5 text-[10px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
                active ? "text-signal-text" : "text-muted"
              }`}
            >
              <item.icon />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
