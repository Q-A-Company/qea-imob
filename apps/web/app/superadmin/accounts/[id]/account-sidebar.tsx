"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, BarChart3, LayoutDashboard, Settings, Target, Users, type LucideIcon } from "lucide-react";

interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  href: string;
}

function buildAccountNavItems(accountId: string): NavItem[] {
  const base = `/superadmin/accounts/${accountId}`;
  return [
    { key: "painel", label: "Dashboard", icon: LayoutDashboard, href: base },
    { key: "relatorios", label: "Relatórios", icon: BarChart3, href: `${base}/relatorios` },
    { key: "concorrentes", label: "Concorrentes", icon: Target, href: `${base}/competitors` },
    { key: "usuarios", label: "Usuários", icon: Users, href: `${base}/users` },
    { key: "configuracoes", label: "Configurações", icon: Settings, href: `${base}/settings` },
    { key: "erros", label: "Relatório de erros", icon: AlertTriangle, href: `${base}/errors` },
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
// Ícones lucide-react duplicados de sidebar.tsx de propósito, mesmo
// raciocínio de sempre (essa sidebar navega por accountId, conceito
// diferente o suficiente de buildNavItems que acoplar os dois só pra
// reaproveitar a lista de ícones não compensa).
export function AccountSidebar({ accountId }: { accountId: string }) {
  const pathname = usePathname();
  const items = buildAccountNavItems(accountId);

  return (
    <>
      <nav
        aria-label="Navegação da conta"
        className="print:hidden group fixed inset-y-0 left-0 z-30 hidden w-16 flex-col gap-1 overflow-hidden border-r border-surface-border bg-nav py-4 transition-[width] duration-200 ease-out hover:w-56 focus-within:w-56 md:flex"
      >
        {/* Mesmo tratamento de marca de (dashboard)/sidebar.tsx (duplicado de
            propósito, ver raciocínio no topo do arquivo) — "Q&A" sempre
            visível, "Imob" + tagline reveladas no hover/foco junto com os
            labels dos itens abaixo. */}
        <div className="mb-4 flex flex-col gap-0.5 px-3">
          <p className="whitespace-nowrap font-display text-lg leading-tight font-bold text-signal-text">
            Q&amp;A
            <span className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
              &nbsp;Imob
            </span>
          </p>
          {/* Sem whitespace-nowrap de propósito — ver comentário equivalente
              em (dashboard)/sidebar.tsx. */}
          <p className="text-[11px] leading-tight text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
            Acompanhe seus concorrentes em tempo real!
          </p>
        </div>
        <ul className="flex flex-col gap-1 px-2">
          {items.map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  onClick={blurOnMouseClick}
                  className={`group/navlink flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
                    active ? "bg-signal/10 text-signal-text" : "text-muted hover:bg-background hover:text-foreground"
                  }`}
                >
                  <item.icon className="h-5 w-5 shrink-0 transition-transform duration-200 ease-out group-hover/navlink:scale-110" />
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
        className="print:hidden fixed inset-x-0 bottom-0 z-30 flex border-t border-surface-border bg-nav py-1 md:hidden"
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
              className={`group/navlink flex flex-1 flex-col items-center gap-0.5 rounded-md py-1.5 text-[10px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
                active ? "text-signal-text" : "text-muted"
              }`}
            >
              <item.icon className="h-5 w-5 shrink-0 transition-transform duration-200 ease-out group-hover/navlink:scale-110" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
