"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

// Compartilhado entre Histórico e Relatório de Erros (SuperAdmin) — mesmo
// padrão visual pedido pras duas telas. Conteúdo de `children` já vem
// pronto do servidor (não busca nada sob demanda no clique); só alterna
// visibilidade local. Simples de propósito: os dois usos têm no máximo
// ~30 linhas por página, não precisa de fetch preguiçoso.
export function ExpandableRow({ summary, children }: { summary: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="px-4 py-3.5">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-start gap-3 text-left">
        <ChevronRight
          className={`mt-0.5 h-4 w-4 shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
        <div className="min-w-0 flex-1">{summary}</div>
      </button>
      {open && <div className="mt-3 pl-7">{children}</div>}
    </li>
  );
}
