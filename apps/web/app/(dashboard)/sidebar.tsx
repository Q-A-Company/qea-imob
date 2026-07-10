"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { UserRole } from "@/lib/supabase/types";

// Duplicado (não importado de lib/auth/dal.ts) de propósito: aquele arquivo
// tem "server-only" no topo — importar aqui quebraria o build do client
// component. É só um mapa de 2 linhas, não vale a pena reestruturar por isso.
const ROLE_HOME: Record<UserRole, string> = {
  admin: "/admin",
  gerente: "/admin",
  usuario: "/user",
  superadmin: "/superadmin",
};

function PulseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      <path d="M2 12h4l2.5-7L13 19l2.5-7H22" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
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

function GearIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.36.24.75.24 1.15V10a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
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

function UsersIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

interface NavItem {
  key: string;
  label: string;
  icon: () => React.ReactElement;
  href: string;
  roles: UserRole[];
}

// Concorrentes/Configurações são funções de gestão puras — sem versão
// somente-leitura, ficam admin-only (Etapa 10). Painel/Histórico/Relatórios
// (Etapa 11) são as mesmas informações pros dois roles, só que em rotas
// /admin/* ou /user/* separadas — ver o trade-off registrado no README
// (rotas espelhadas, não uma rota só com `if` de role: mantém /admin/*
// como invariante "só Admin entra", auditável sem abrir cada página).
// Notificações NÃO tem item aqui de propósito — só é alcançável pelo sino
// no header (ver notification-bell-client.tsx), pra não duplicar acesso à
// mesma informação em dois lugares do chrome.
function buildNavItems(role: UserRole): NavItem[] {
  const base = role === "usuario" ? "/user" : "/admin";
  const items: NavItem[] = [
    {
      key: "painel",
      label: role === "superadmin" ? "Clientes" : "Painel",
      icon: PulseIcon,
      href: ROLE_HOME[role],
      roles: ["admin", "gerente", "usuario", "superadmin"],
    },
    { key: "historico", label: "Histórico", icon: ClockIcon, href: `${base}/history`, roles: ["admin", "gerente", "usuario"] },
    { key: "relatorios", label: "Relatórios", icon: ReportIcon, href: `${base}/relatorios`, roles: ["admin", "gerente", "usuario"] },
    { key: "concorrentes", label: "Concorrentes", icon: TargetIcon, href: "/admin/competitors", roles: ["admin", "gerente"] },
    // Gerente também gerencia usuários (só que com teto: não cria/gerencia
    // outro gerente/admin — restrição aplicada nas Server Actions, ver
    // lib/users/actions.ts), por isso este item aparece pros dois cargos.
    { key: "usuarios", label: "Usuários", icon: UsersIcon, href: "/admin/users", roles: ["admin", "gerente"] },
    // Corretor também acessa — só a preferência PESSOAL de e-mail
    // (/user/settings, mesmo componente reaproveitado de /admin/settings);
    // a gestão dos canais da conta continua exclusiva de admin/gerente,
    // isso é controlado dentro da própria página, não pelo requireRole daqui.
    { key: "configuracoes", label: "Configurações", icon: GearIcon, href: `${base}/settings`, roles: ["admin", "gerente", "usuario"] },
    // Plataforma inteira, não escopado a nenhuma conta — só SuperAdmin.
    { key: "sistema", label: "Sistema", icon: GearIcon, href: "/superadmin/system", roles: ["superadmin"] },
  ];
  return items.filter((item) => item.roles.includes(role));
}

// event.detail é a contagem de cliques do mouse — 0 quando o link é ativado
// por teclado (Enter/Espaço), 1+ quando é clique de mouse de verdade. Só tira
// o foco no caso de mouse: senão, depois de clicar, o link clicado continua
// focado, focus-within continua verdadeiro, e a sidebar fica presa expandida
// até o usuário clicar em outro lugar da tela — mesmo com o mouse já longe
// do menu. Sem afetar Tab: ali detail é sempre 0.
function blurOnMouseClick(e: React.MouseEvent<HTMLAnchorElement>) {
  if (e.detail !== 0) {
    e.currentTarget.blur();
  }
}

export function Sidebar({
  role,
  pinned,
  onTogglePin,
}: {
  role: UserRole;
  pinned: boolean;
  onTogglePin: () => void;
}) {
  const pathname = usePathname();
  const items = buildNavItems(role);

  // Quando fixa (pinned), a label não depende de hover: sempre visível.
  const labelOpacityClass = pinned
    ? "opacity-100"
    : "opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100";

  return (
    <>
      {/* Desktop: overlay que expande no hover/foco (ou fica sempre expandida
          se pinned) — nunca empurra o conteúdo por si só; o layout.tsx é quem
          decide a margem reservada, olhando o mesmo cookie no servidor. */}
      <nav
        aria-label="Navegação principal"
        className={`print:hidden group fixed inset-y-0 left-0 z-30 hidden flex-col gap-1 overflow-hidden border-r border-surface-border bg-surface py-4 transition-[width] duration-200 ease-out md:flex ${
          pinned ? "w-56" : "w-16 hover:w-56 focus-within:w-56"
        }`}
      >
        <div className="mb-3 flex items-center justify-between gap-2 px-3 text-signal-text">
          <div className="flex items-center gap-3">
            <PulseIcon />
            <span className={`whitespace-nowrap text-sm font-semibold ${labelOpacityClass}`}>Q&amp;A Imob</span>
          </div>
          <button
            type="button"
            onClick={onTogglePin}
            aria-label={pinned ? "Recolher menu" : "Fixar menu expandido"}
            aria-pressed={pinned}
            className={`shrink-0 rounded-md p-1 text-muted hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${labelOpacityClass}`}
          >
            {pinned ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
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
                  <span className={labelOpacityClass}>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Mobile: bottom nav fixo, só ícones — mais natural que hambúrguer
          pra 2-5 itens, e não depende de hover (dispositivo de toque). */}
      <nav
        aria-label="Navegação principal"
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
