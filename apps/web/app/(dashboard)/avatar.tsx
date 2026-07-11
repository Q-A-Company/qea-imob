const SIZE_CLASSES = {
  sm: "h-8 w-8 text-xs",
  lg: "h-16 w-16 text-lg",
} as const;

// Pixels exatos, aplicados via style inline (não só classe) — no chip de
// conta da sidebar recolhida (account-menu.tsx), o avatar continuava
// achatado/estreito mesmo com h-8/w-8/shrink-0/aspect-square via classe,
// mesmo o espaço disponível (nas contas) devendo caber o avatar sem
// cortar nada. Não isolei a causa exata sem inspecionar o navegador de
// verdade (comportamento não bateu com o que a spec de flexbox prevê) —
// style inline é a garantia definitiva: nenhum cálculo de flex-shrink,
// min-width automático ou interação com aspect-ratio pode alterar um
// width/height fixado assim, é a última palavra do navegador.
export const AVATAR_SIZE_PX = {
  sm: 32,
  lg: 64,
} as const;

// Reaproveitado por competitor-avatar.tsx — mesma garantia (width/height/
// min-width/min-height fixados via style, não só classe) pro avatar de
// concorrente não sofrer o mesmo achatamento que o avatar de pessoa sofria
// antes dentro do chip da sidebar (ver account-menu.tsx).
export function avatarFixedSizeStyle(size: keyof typeof AVATAR_SIZE_PX): { width: number; height: number; minWidth: number; minHeight: number } {
  const px = AVATAR_SIZE_PX[size];
  return { width: px, height: px, minWidth: px, minHeight: px };
}

// Duplicado de propósito (não importado de header.tsx) — mesmo raciocínio
// de ROLE_HOME em sidebar.tsx: é só uma função de 5 linhas, não vale a pena
// reestruturar um import por ela.
function initials(fullName: string | null): string {
  if (!fullName) return "?";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase();
}

// Foto do usuário quando profiles.avatar_url existe; fallback pras
// iniciais do nome quando não (comportamento que já existia no header antes
// de avatar_url virar uma opção real — mantido aqui).
export function Avatar({
  avatarUrl,
  fullName,
  size = "sm",
  className = "",
}: {
  avatarUrl: string | null;
  fullName: string | null;
  size?: "sm" | "lg";
  // Extra classes (ex: margem) do chamador — nunca usado pra reduzir
  // largura/altura do avatar em si (ver account-menu.tsx: centralizar um
  // avatar maior que os ícones ao lado usa margem negativa aqui, não um
  // container flex menor que o próprio avatar, que foi o que causou
  // achatamento antes).
  className?: string;
}) {
  const fixedSizeStyle = avatarFixedSizeStyle(size);

  if (avatarUrl) {
    return (
      // avatar_url é uma URL pública do Storage, não um asset local — next/image
      // exigiria configurar remotePatterns pro domínio do Supabase só pra isso.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={fullName ?? "Foto de perfil"}
        style={fixedSizeStyle}
        className={`${SIZE_CLASSES[size]} shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <div
      aria-hidden
      style={fixedSizeStyle}
      className={`flex ${SIZE_CLASSES[size]} shrink-0 items-center justify-center rounded-full bg-signal/15 font-semibold text-signal-text ${className}`}
    >
      {initials(fullName)}
    </div>
  );
}
