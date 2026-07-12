import Link from "next/link";
import type { LucideIcon } from "lucide-react";

// Padroniza todo botão só-ícone do app (referência visual: container
// quadrado com cantos arredondados, borda sutil sempre visível — não só
// no hover como era antes —, fundo escuro, ícone centralizado). Só 2
// variantes: cobrem os 4 casos reais do inventário (excluir concorrente/
// usuário = destructive; fixar sidebar/editar usuário = default). `href`
// opcional troca o elemento renderizado pra <Link> (caso "editar usuário",
// que navega em vez de disparar uma ação) sem precisar de um componente
// separado.
type IconButtonSize = "default" | "compact";
type IconButtonVariant = "default" | "destructive";

const SIZE_CLASS: Record<IconButtonSize, string> = {
  default: "h-9 w-9",
  compact: "h-7 w-7",
};

// compact mantém o MESMO tamanho de ícone que os botões densos de tabela
// já usavam (16px) — só ganham a moldura quadrada nova, o ícone em si não
// muda de tamanho nesses contextos apertados.
const ICON_SIZE_CLASS: Record<IconButtonSize, string> = {
  default: "h-[18px] w-[18px]",
  compact: "h-4 w-4",
};

// destructive reaproveita a MESMA paleta erro/ferrugem já usada no
// IconChip (icon-chip.tsx, tone="erro") do redesign de cards — glow sutil
// (bg-erro/10), não um vermelho chapado.
const VARIANT_CLASS: Record<IconButtonVariant, string> = {
  default: "border-surface-border bg-background text-muted hover:border-foreground/30 hover:text-foreground",
  destructive: "border-erro/30 bg-erro/10 text-erro-texto hover:bg-erro/20",
};

interface IconButtonProps {
  icon: LucideIcon;
  // Único texto — vira aria-label E title juntos (rótulo acessível e
  // tooltip nativo do navegador, sempre a mesma frase).
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  ariaPressed?: boolean;
  className?: string;
}

export function IconButton({
  icon: Icon,
  label,
  variant = "default",
  size = "default",
  href,
  onClick,
  type = "button",
  disabled,
  ariaPressed,
  className = "",
}: IconButtonProps) {
  const sharedClassName = `inline-flex shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:pointer-events-none disabled:opacity-50 ${SIZE_CLASS[size]} ${VARIANT_CLASS[variant]} ${className}`;

  const iconEl = <Icon className={ICON_SIZE_CLASS[size]} aria-hidden />;

  if (href) {
    return (
      <Link href={href} aria-label={label} title={label} className={sharedClassName}>
        {iconEl}
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={ariaPressed}
      title={label}
      className={sharedClassName}
    >
      {iconEl}
    </button>
  );
}
