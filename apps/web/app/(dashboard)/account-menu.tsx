"use client";

import { useRef, useState } from "react";
import { ChevronUp, LogOut } from "lucide-react";
import { logout } from "@/lib/auth/actions";
import { Avatar } from "./avatar";
import { ROLE_LABEL, type UserRole } from "@/lib/supabase/types";

const PANEL_WIDTH = 200;
const VIEWPORT_MARGIN = 12;

// Chip de conta compacto (avatar + nome + cargo) que abre um popover ACIMA
// dele com "Sair" — substitui a lista fixa empilhada que vivia no rodapé da
// sidebar antes. "Configurações" foi removido do popover (já existe como
// item normal de navegação, redundante aqui). Usado tanto na sidebar
// principal (variant "row", com nome/cargo visíveis quando expandida) quanto
// na barra inferior mobile (variant "compact", ícone+rótulo pequeno igual
// aos outros itens daquela barra) — mesmo popover fixed-position nos dois
// casos, pelo mesmo motivo do sino (escapar do overflow-hidden da sidebar).
export function AccountMenu({
  fullName,
  avatarUrl,
  role,
  variant,
  labelOpacityClass,
}: {
  fullName: string | null;
  avatarUrl: string | null;
  role: UserRole;
  variant: "row" | "compact";
  // Só usado no variant "row" — some quando a sidebar está recolhida.
  labelOpacityClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<{ bottom: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function handleOpen() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const left = Math.min(Math.max(rect.left, VIEWPORT_MARGIN), window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN);
      const bottom = window.innerHeight - rect.top + 8;
      setPanelStyle({ bottom, left });
    }
    setOpen((v) => !v);
  }

  return (
    <>
      {variant === "row" ? (
        <button
          ref={buttonRef}
          type="button"
          onClick={handleOpen}
          aria-expanded={open}
          aria-label="Menu da conta"
          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium whitespace-nowrap text-muted hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        >
          {/* -ml-1.5 (6px) em vez do wrapper flex h-5 w-5 que existia aqui
              antes — aquele wrapper forçava o avatar (32px) a "estourar"
              uma caixa flex de 20px pros dois lados, e por algum motivo
              (não isolado com certeza sem inspecionar num navegador de
              verdade) isso estava saindo com proporção errada, achatada,
              em vez de só centralizado. Margem negativa direta compensa a
              MESMA diferença de largura (ícones são h-5=20px, avatar é
              h-8=32px; diferença/2=6px) sem nenhum container extra — o
              avatar continua um elemento de bloco normal, 32x32 de
              verdade, só deslocado 6px pra esquerda pra centralizar com a
              coluna de ícones. */}
          <Avatar avatarUrl={avatarUrl} fullName={fullName} size="sm" className="-ml-1.5" />
          <span className={`min-w-0 flex-1 truncate text-left ${labelOpacityClass ?? ""}`}>
            {fullName ?? "Sem nome"}
            <span className="block text-xs text-muted/80">{ROLE_LABEL[role]}</span>
          </span>
          <ChevronUp className={`h-4 w-4 shrink-0 ${labelOpacityClass ?? ""}`} />
        </button>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          onClick={handleOpen}
          aria-expanded={open}
          aria-label="Menu da conta"
          className="flex flex-1 items-center justify-center rounded-md py-2.5 text-muted"
        >
          <Avatar avatarUrl={avatarUrl} fullName={fullName} size="sm" />
        </button>
      )}

      {open && panelStyle && (
        <>
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            style={{ position: "fixed", bottom: panelStyle.bottom, left: panelStyle.left, width: PANEL_WIDTH }}
            className="z-50 overflow-hidden rounded-lg border border-surface-border bg-surface py-1 shadow-lg"
          >
            <form action={logout}>
              <button
                type="submit"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-background"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            </form>
          </div>
        </>
      )}
    </>
  );
}
