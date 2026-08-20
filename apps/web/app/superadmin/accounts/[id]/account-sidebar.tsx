"use client";

import { Suspense, use } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  History,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import { AccountMenu } from "@/app/(dashboard)/account-menu";
import { IconButton } from "@/app/(dashboard)/icon-button";
import { NavPendingOverlay } from "@/app/(dashboard)/nav-pending-overlay";
import type { UserRole } from "@/lib/supabase/types";

interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  href: string;
}

export interface AccountNavBadges {
  hasPendingReview: boolean;
  hasNewErrors: boolean;
}

// "configuracoes" acende quando há revisão de site_config pendente
// (getPendingSiteConfigCount); "erros" acende quando há erro mais novo que a
// última visita do SuperAdmin a esta aba, nesta conta
// (getHasNewErrorsForAccount) — some sozinho ao visitar, sem precisar
// "limpar" nada (pedido explícito do usuário).
function computeShowBadge(item: NavItem, badges: AccountNavBadges): boolean {
  if (item.key === "configuracoes") return badges.hasPendingReview;
  if (item.key === "erros") return badges.hasNewErrors;
  return false;
}

// use() suspende só ESTE componente, não o resto do NavIcon/item de nav —
// os badges chegam um instante depois do resto da sidebar (a Promise vem
// de layout.tsx, sem await direto lá), em vez de travar a navegação
// inteira até as duas consultas de badge terminarem. Mesmo raciocínio do
// sino de notificações em (dashboard)/notification-bell-section.tsx —
// achado real: antes desta mudança, entrar/navegar dentro de uma conta
// como SuperAdmin nunca mostrava o loading.tsx (o layout segurava tudo),
// diferente de admin/gerente/usuario, que já tinha esse conserto.
function NavBadgeDot({ item, badgesPromise }: { item: NavItem; badgesPromise: Promise<AccountNavBadges> }) {
  const badges = use(badgesPromise);
  if (!computeShowBadge(item, badges)) return null;
  return <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-erro" aria-hidden="true" />;
}

// Mesma ideia do dot, só que pro texto acessível "(novo)" — separado
// porque um <span> dentro de texto (não posicionado/absolute) precisa
// suspender independente do dot, senão os dois brigam pelo mesmo
// Suspense mais próximo sem necessidade.
function NavBadgeSrText({ item, badgesPromise }: { item: NavItem; badgesPromise: Promise<AccountNavBadges> }) {
  const badges = use(badgesPromise);
  if (!computeShowBadge(item, badges)) return null;
  return <span className="sr-only"> (novo)</span>;
}

function NavIcon({ icon: Icon, item, badgesPromise }: { icon: LucideIcon; item: NavItem; badgesPromise: Promise<AccountNavBadges> }) {
  return (
    <span className="relative inline-flex shrink-0">
      <Icon className="h-5 w-5 shrink-0 transition-transform duration-200 ease-out group-hover/navlink:scale-110" />
      <Suspense fallback={null}>
        <NavBadgeDot item={item} badgesPromise={badgesPromise} />
      </Suspense>
    </span>
  );
}

function buildAccountNavItems(accountId: string): NavItem[] {
  const base = `/superadmin/accounts/${accountId}`;
  return [
    { key: "painel", label: "Dashboard", icon: LayoutDashboard, href: base },
    { key: "relatorios", label: "Relatórios", icon: BarChart3, href: `${base}/relatorios` },
    { key: "historico", label: "Histórico", icon: History, href: `${base}/history` },
    { key: "concorrentes", label: "Concorrentes", icon: Target, href: `${base}/competitors` },
    { key: "usuarios", label: "Usuários", icon: Users, href: `${base}/users` },
    { key: "configuracoes", label: "Configurações", icon: Settings, href: `${base}/settings` },
    // Reaproveita audit_log (já escopado por account_id), excluindo
    // login/logout — ver lib/audit/get-account-audit-log.ts.
    { key: "atividade", label: "Atividade", icon: Activity, href: `${base}/activity` },
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

// Mesma estrutura visual/interação de (dashboard)/sidebar.tsx, incluindo o
// pin (fixar/recolher) — antes fixa em w-16 hover:w-56 sem o botão de pin,
// diferente das demais sidebars do app; unificado a pedido do usuário. Ícones
// lucide-react duplicados de sidebar.tsx de propósito, mesmo raciocínio de
// sempre (essa sidebar navega por accountId, conceito diferente o suficiente
// de buildNavItems que acoplar os dois só pra reaproveitar a lista de ícones
// não compensa).
export function AccountSidebar({
  accountId,
  pinned,
  onTogglePin,
  fullName,
  avatarUrl,
  role,
  badgesPromise,
}: {
  accountId: string;
  pinned: boolean;
  onTogglePin: () => void;
  fullName: string | null;
  avatarUrl: string | null;
  role: UserRole;
  badgesPromise: Promise<AccountNavBadges>;
}) {
  const pathname = usePathname();
  const items = buildAccountNavItems(accountId);

  const labelOpacityClass = pinned
    ? "opacity-100"
    : "opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100";

  return (
    <>
      <nav
        aria-label="Navegação da conta"
        className={`print:hidden group fixed inset-y-0 left-0 z-30 hidden flex-col overflow-hidden border-r border-surface-border bg-nav py-4 transition-[width] duration-200 ease-out md:flex ${
          pinned ? "w-56" : "w-16 hover:w-56 focus-within:w-56"
        }`}
      >
        {/* Mesmo tratamento de marca de (dashboard)/sidebar.tsx (duplicado de
            propósito, ver raciocínio no topo do arquivo) — "Q&A" sempre
            visível, "Imob" + tagline reveladas no hover/foco/pin junto com os
            labels dos itens abaixo. */}
        <div className="mb-4 flex items-start justify-between gap-2 px-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="whitespace-nowrap font-display text-lg leading-tight font-bold text-signal-text">
              Q&amp;A<span className={labelOpacityClass}>&nbsp;Imob</span>
            </p>
            {/* Sem whitespace-nowrap de propósito — ver comentário equivalente
                em (dashboard)/sidebar.tsx. */}
            <p className={`text-[11px] leading-tight text-muted ${labelOpacityClass}`}>
              Uma solução da Q&A Company.
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
        {/* overflow-x-hidden explícito — ver comentário equivalente em
            (dashboard)/sidebar.tsx (mesma causa: overflow-y-auto sozinho
            força overflow-x:auto também, expondo o vazamento horizontal do
            rótulo dos itens quando a sidebar está recolhida). */}
        <ul className="flex flex-col gap-1 overflow-y-auto overflow-x-hidden px-2">
          {items.map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  onClick={blurOnMouseClick}
                  className={`group/navlink flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
                    active ? "bg-foreground/5 text-foreground" : "text-muted hover:bg-background hover:text-foreground"
                  }`}
                >
                  <NavIcon icon={item.icon} item={item} badgesPromise={badgesPromise} />
                  <span className={labelOpacityClass}>
                    {item.label}
                    <Suspense fallback={null}>
                      <NavBadgeSrText item={item} badgesPromise={badgesPromise} />
                    </Suspense>
                  </span>
                  <NavPendingOverlay pinned={pinned} />
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Rodapé fixo — chip de conta, migrado do header removido. Sem
            sino: o SuperAdmin não tem notificações escopadas à conta que
            está visitando (mesmo comportamento de antes). */}
        <div className="mt-auto border-t border-surface-border px-2 pt-2">
          <AccountMenu fullName={fullName} avatarUrl={avatarUrl} role={role} variant="row" labelOpacityClass={labelOpacityClass} />
        </div>
      </nav>

      <nav
        aria-label="Navegação da conta"
        className="print:hidden fixed inset-x-0 bottom-0 z-30 flex border-t border-surface-border bg-nav py-1 md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            // Sem aria-label estático de propósito (diferente de antes) —
            // aria-label sobrescreveria o nome acessível inteiro e ignoraria
            // o <NavBadgeSrText> abaixo (que só resolve depois de
            // streamado); deixando sem, o nome acessível vem do texto
            // visível (item.label) + o sr-only quando existir, os dois
            // reais children do link.
            <Link
              key={item.key}
              href={item.href}
              onClick={blurOnMouseClick}
              className={`group/navlink flex flex-1 flex-col items-center gap-0.5 rounded-md py-1.5 text-[10px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
                active ? "text-signal-text" : "text-muted"
              }`}
            >
              <NavIcon icon={item.icon} item={item} badgesPromise={badgesPromise} />
              {item.label}
              <Suspense fallback={null}>
                <NavBadgeSrText item={item} badgesPromise={badgesPromise} />
              </Suspense>
              <NavPendingOverlay pinned={pinned} />
            </Link>
          );
        })}
        <AccountMenu fullName={fullName} avatarUrl={avatarUrl} role={role} variant="compact" />
      </nav>
    </>
  );
}
