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
  Server,
  Settings,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import { AccountMenu } from "./account-menu";
import { IconButton } from "./icon-button";
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
    { key: "relatorios", label: "Relatórios", icon: BarChart3, href: `${base}/relatorios`, roles: ["admin", "gerente", "usuario"] },
    { key: "historico", label: "Histórico", icon: History, href: `${base}/history`, roles: ["admin", "gerente", "usuario"] },
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
    // Ícone Server (não Settings) de propósito — distinto do item
    // "Configurações" pessoal logo abaixo, que também usa uma engrenagem
    // (mesmo ícone que os outros roles usam pra config pessoal); os dois
    // apareceriam idênticos lado a lado se usassem o mesmo ícone.
    { key: "sistema", label: "Sistema", icon: Server, href: "/superadmin/system", roles: ["superadmin"] },
    // Configuração PESSOAL do SuperAdmin (hoje só Aparência) — distinta de
    // "Sistema" acima (config global da plataforma). Sem essa rota, o
    // SuperAdmin não teria como trocar de tema depois que o toggle saiu do
    // header removido.
    { key: "configuracoes-superadmin", label: "Configurações", icon: Settings, href: "/superadmin/settings", roles: ["superadmin"] },
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
  fullName,
  avatarUrl,
}: {
  role: UserRole;
  pinned: boolean;
  onTogglePin: () => void;
  fullName: string | null;
  avatarUrl: string | null;
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
        className={`print:hidden group fixed inset-y-0 left-0 z-30 hidden flex-col overflow-hidden border-r border-surface-border bg-nav py-4 transition-[width] duration-200 ease-out md:flex ${
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
          <IconButton
            icon={pinned ? PanelLeftClose : PanelLeftOpen}
            label={pinned ? "Recolher menu" : "Fixar menu expandido"}
            ariaPressed={pinned}
            size="compact"
            onClick={onTogglePin}
            className={labelOpacityClass}
          />
        </div>
        {/* overflow-x-hidden explícito — sem isso, overflow-y-auto sozinho
            força overflow-x para "auto" também (regra da spec de CSS: um
            eixo não-visible obriga o outro a deixar de ser visible), e o
            <span> do rótulo de cada item vaza horizontalmente quando
            recolhido (largura real do texto, só opacity-0, não width:0 —
            necessário pra transição suave ao expandir). Antes vazava pro
            overflow-hidden do <nav> pai sem barra visível; com scrollbar
            customizada (sempre visível), isso virou uma barra horizontal
            visível bem feia. Nunca deveria existir scroll horizontal aqui. */}
        <ul className="flex flex-col gap-1 overflow-y-auto overflow-x-hidden px-2">
          {items.map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.key}>
                {/* group/navlink separado do group da nav inteira (que revela o
                    texto no hover) — escala só o ícone deste link, no hover
                    dele especificamente, sem afetar os outros itens.
                    Item ativo: wash de latão em baixa opacidade (não sólido —
                    isso seria opacidade demais pra um item de lista), texto/
                    ícone em --signal-text, e uma barra fina (3px, rounded-full)
                    na borda esquerda via ::before absoluto — `relative`
                    sempre presente (não só quando ativo) pra não recalcular
                    layout ao trocar de página. A barra fica inset verticalmente
                    (top/bottom 6px) em vez de inset-y-0, pra nunca entrar na
                    curva do rounded-md do próprio item (fica só no trecho reto
                    da borda). Funciona igual recolhida (w-16, só ícone) e
                    expandida (w-56, hover/pin) — é o mesmo elemento nos dois
                    estados, só a label que aparece/some por cima. */}
                <Link
                  href={item.href}
                  onClick={blurOnMouseClick}
                  className={`group/navlink relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
                    active ? "bg-signal/10 text-signal-text" : "text-muted hover:bg-background hover:text-foreground"
                  }`}
                >
                  {active && <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-signal" aria-hidden />}
                  <item.icon className="h-5 w-5 shrink-0 transition-transform duration-200 ease-out group-hover/navlink:scale-110" />
                  <span className={labelOpacityClass}>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Rodapé fixo (mt-auto empurra pro fim da coluna flex) — chip de
            conta (avatar + nome + cargo), migrado do header removido; abre
            um popover com Configurações/Sair (ver account-menu.tsx). Linha
            divisória separa visualmente dos itens de navegação acima.
            Notificações não mora mais aqui — voltou pro canto superior
            direito (ver dashboard-chrome.tsx), a pedido do usuário. */}
        <div className="mt-auto border-t border-surface-border px-2 pt-2">
          <AccountMenu fullName={fullName} avatarUrl={avatarUrl} role={role} variant="row" labelOpacityClass={labelOpacityClass} />
        </div>
      </nav>

      {/* Mobile: bottom nav fixo, só ícones — mais natural que hambúrguer
          pra 2-5 itens, e não depende de hover (dispositivo de toque). O
          chip de conta (Configurações/Sair) entra como último item, mesmo
          popover de cima. Notificações não entra aqui — o sino flutuante
          (dashboard-chrome.tsx) já cobre mobile também, sendo fixed em
          viewport, não só desktop.
          Sem rótulo de texto sob o ícone (só aria-label, pra leitor de
          tela) — com até 6 itens de navegação + chip de conta dividindo a
          largura em partes iguais, texto de 10px por baixo de cada ícone
          ficava espremido/cortado numa tela de telefone real. */}
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
              className={`group/navlink flex flex-1 items-center justify-center rounded-md py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
                active ? "text-signal-text" : "text-muted"
              }`}
            >
              <item.icon className="h-5 w-5 shrink-0 transition-transform duration-200 ease-out group-hover/navlink:scale-110" />
            </Link>
          );
        })}
        <AccountMenu fullName={fullName} avatarUrl={avatarUrl} role={role} variant="compact" />
      </nav>
    </>
  );
}
