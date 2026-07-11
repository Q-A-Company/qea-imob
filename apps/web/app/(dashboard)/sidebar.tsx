"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  History,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
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

interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
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
      label: role === "superadmin" ? "Clientes" : "Dashboard",
      icon: role === "superadmin" ? Building2 : LayoutDashboard,
      href: ROLE_HOME[role],
      roles: ["admin", "gerente", "usuario", "superadmin"],
    },
    { key: "historico", label: "Histórico", icon: History, href: `${base}/history`, roles: ["admin", "gerente", "usuario"] },
    { key: "relatorios", label: "Relatórios", icon: BarChart3, href: `${base}/relatorios`, roles: ["admin", "gerente", "usuario"] },
    { key: "concorrentes", label: "Concorrentes", icon: Target, href: "/admin/competitors", roles: ["admin", "gerente"] },
    // Gerente também gerencia usuários (só que com teto: não cria/gerencia
    // outro gerente/admin — restrição aplicada nas Server Actions, ver
    // lib/users/actions.ts), por isso este item aparece pros dois cargos.
    { key: "usuarios", label: "Usuários", icon: Users, href: "/admin/users", roles: ["admin", "gerente"] },
    // Corretor também acessa — só a preferência PESSOAL de e-mail
    // (/user/settings, mesmo componente reaproveitado de /admin/settings);
    // a gestão dos canais da conta continua exclusiva de admin/gerente,
    // isso é controlado dentro da própria página, não pelo requireRole daqui.
    { key: "configuracoes", label: "Configurações", icon: Settings, href: `${base}/settings`, roles: ["admin", "gerente", "usuario"] },
    // Plataforma inteira, não escopado a nenhuma conta — só SuperAdmin.
    { key: "sistema", label: "Sistema", icon: Settings, href: "/superadmin/system", roles: ["superadmin"] },
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
        className={`print:hidden group fixed inset-y-0 left-0 z-30 hidden flex-col gap-1 overflow-hidden border-r border-surface-border bg-nav py-4 transition-[width] duration-200 ease-out md:flex ${
          pinned ? "w-56" : "w-16 hover:w-56 focus-within:w-56"
        }`}
      >
        {/* Marca: "Q&A" fica sempre visível (é o que aparece com a sidebar
            recolhida, só ícones) — "Imob" e a tagline usam o mesmo
            labelOpacityClass dos itens de navegação abaixo, revelados junto
            no hover/foco/pin. font-display (BR Sonoma) + text-foreground —
            item de destaque da área, não mais texto pequeno ao lado de um
            ícone (o antigo Activity saiu). */}
        <div className="mb-4 flex items-start justify-between gap-2 px-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="whitespace-nowrap font-display text-lg leading-tight font-bold text-signal-text">
              Q&amp;A<span className={labelOpacityClass}>&nbsp;Imob</span>
            </p>
            {/* Sem whitespace-nowrap aqui de propósito (diferente do nome
                acima) — a frase é mais longa que os 200px úteis da sidebar
                expandida (224px - padding); precisa poder quebrar em 2
                linhas em vez de estourar e ficar cortada pelo overflow-hidden
                do nav. */}
            <p className={`text-[11px] leading-tight text-muted ${labelOpacityClass}`}>
              Acompanhe seus concorrentes em tempo real!
            </p>
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
                {/* group/navlink separado do group da nav inteira (que revela o
                    texto no hover) — escala só o ícone deste link, no hover
                    dele especificamente, sem afetar os outros itens. */}
                <Link
                  href={item.href}
                  onClick={blurOnMouseClick}
                  className={`group/navlink flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
                    active ? "bg-signal/10 text-signal-text" : "text-muted hover:bg-background hover:text-foreground"
                  }`}
                >
                  <item.icon className="h-5 w-5 shrink-0 transition-transform duration-200 ease-out group-hover/navlink:scale-110" />
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
