import { colorForCompetitor } from "@/lib/categorical-colors";
import { AVATAR_SIZE_PX, avatarFixedSizeStyle } from "./avatar";

// text-xs (12px) igual ao Avatar de pessoa não coube — abreviação de
// concorrente vai até 6 caracteres (register-form.tsx), diferente de
// iniciais de pessoa (sempre 2). Fonte menor + corta pra 4 caracteres na
// exibição (dado real: "MULRJ" tem 5) — abreviação completa continua no
// title (tooltip), o círculo é só um sinal visual rápido, não precisa
// caber o texto inteiro.
const SIZE_CLASSES = {
  sm: "h-8 w-8 text-[9px] tracking-tight",
  lg: "h-16 w-16 text-lg",
} as const;
const MAX_CHARS = { sm: 4, lg: 6 } as const;

// Avatar de CONCORRENTE (abreviação + cor categórica determinística, ver
// lib/categorical-colors.ts) — mesmo princípio do Avatar de pessoa
// (avatar.tsx), reaproveitando a mesma técnica de tamanho fixo via style
// inline (AVATAR_SIZE_PX/avatarFixedSizeStyle), só que sempre "fallback"
// (nunca tem uma foto, concorrente não tem avatar_url) e a cor vem do hash
// determinístico do competitorId em vez de ser sempre a mesma cor de
// acento. Usado nas 3 telas de notificação (sino, dropdown, página
// completa) — nem toda notificação tem competitorId (ver
// notifications.competitor_id, migration 0022 — só null pra notificações
// anteriores a essa migration), null cai num círculo neutro sem letras.
export function CompetitorAvatar({
  competitorId,
  abbreviation,
  size = "sm",
  className = "",
}: {
  competitorId: string | null;
  abbreviation: string | null;
  size?: "sm" | "lg";
  className?: string;
}) {
  const color = competitorId ? colorForCompetitor(competitorId) : undefined;
  const displayText = abbreviation ? abbreviation.slice(0, MAX_CHARS[size]) : "";
  return (
    <div
      aria-hidden
      title={abbreviation ?? undefined}
      // Texto escuro fixo (não var(--foreground), que muda com o tema) —
      // a paleta categórica inteira (lib/categorical-colors.ts) é de tons
      // médios/claros, mais próxima de --color-alvorada que de
      // --color-noite; branco por cima teria contraste pior do que o já
      // usado em --color-signal-on (mais escuro que qualquer cor da
      // paleta). Escuro funciona nos dois temas porque o fundo do avatar
      // em si não muda com o tema.
      style={{ ...avatarFixedSizeStyle(size), backgroundColor: color, color: color ? "#1f1d1b" : undefined }}
      className={`flex ${SIZE_CLASSES[size]} shrink-0 items-center justify-center rounded-full font-semibold uppercase leading-none ${
        color ? "" : "bg-muted/30 text-muted"
      } ${className}`}
    >
      {displayText}
    </div>
  );
}

// Reexportado só pra quem precisar do tamanho em px sem importar de
// avatar.tsx diretamente (ex: cálculo de layout que precise saber a
// largura do avatar) — evita duas fontes de verdade pro mesmo número.
export { AVATAR_SIZE_PX };
