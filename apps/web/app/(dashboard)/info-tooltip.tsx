"use client";

import { useState } from "react";
import { Info } from "lucide-react";

// Ícone "i" ao lado do título de cada card/gráfico do Painel — clique (não
// só hover, pra funcionar em touch) abre uma explicação breve do que o
// indicador representa. onBlur fecha ao sair por teclado/clique fora.
export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        aria-label="Mais informações"
        aria-expanded={open}
        className="rounded-full p-0.5 text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-20 mt-1.5 w-56 -translate-x-1/2 rounded-md border border-surface-border bg-surface p-2.5 text-xs font-normal text-foreground shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
