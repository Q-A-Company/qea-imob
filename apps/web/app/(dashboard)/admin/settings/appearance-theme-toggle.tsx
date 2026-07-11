"use client";

import { useEffect, useState } from "react";

// Migrado do header removido (theme-toggle.tsx antigo) — mesmo mecanismo,
// só reestilizado como linha de configuração (rótulo + descrição à
// esquerda, controle à direita), igual ao padrão de
// notification-channel-toggle.tsx nesta mesma pasta.
export function AppearanceThemeToggle() {
  // O <html> já vem com a classe certa desde o HTML gerado pelo servidor
  // (app/layout.tsx lê o cookie "theme") — aqui só sincroniza o estado do
  // React com o que o DOM já tem, sem risco de flash nem de mismatch.
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    // Cookie, não localStorage — precisa ser legível pelo servidor
    // (app/layout.tsx) na próxima navegação/reload, não só pelo cliente.
    document.cookie = `theme=${next ? "dark" : "light"}; path=/; max-age=31536000; SameSite=Lax`;
    setIsDark(next);
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-surface-border bg-surface p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">Tema</p>
        <p className="mt-0.5 text-xs text-muted">Aparência clara ou escura do painel — vale só neste dispositivo.</p>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={isDark === null}
        className="shrink-0 rounded-md border border-surface-border px-3 py-1.5 text-sm text-muted hover:bg-background hover:text-foreground disabled:opacity-60"
      >
        {isDark === null ? "..." : isDark ? "Escuro" : "Claro"}
      </button>
    </div>
  );
}
