const SIZE_CLASSES = {
  sm: "h-8 w-8 text-xs",
  lg: "h-16 w-16 text-lg",
} as const;

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
}: {
  avatarUrl: string | null;
  fullName: string | null;
  size?: "sm" | "lg";
}) {
  if (avatarUrl) {
    return (
      // avatar_url é uma URL pública do Storage, não um asset local — next/image
      // exigiria configurar remotePatterns pro domínio do Supabase só pra isso.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatarUrl} alt={fullName ?? "Foto de perfil"} className={`${SIZE_CLASSES[size]} shrink-0 rounded-full object-cover`} />
    );
  }
  return (
    <div
      aria-hidden
      className={`flex ${SIZE_CLASSES[size]} shrink-0 items-center justify-center rounded-full bg-signal/15 font-semibold text-signal-text`}
    >
      {initials(fullName)}
    </div>
  );
}
