"use client";

import { useState } from "react";

export interface TabItem {
  id: string;
  label: string;
}

// Sem lib de tabs (projeto não tem Radix/shadcn instalado, ver
// package.json) — controle simples de aba ativa + render prop, pra quem usa
// decidir o conteúdo de cada painel (útil porque os painéis recebem dado já
// buscado no servidor via props, não fazem fetch próprio).
export function Tabs({ tabs, children }: { tabs: TabItem[]; children: (activeTabId: string) => React.ReactNode }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Seções do usuário" className="flex gap-1 overflow-x-auto border-b border-surface-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => setActive(tab.id)}
            className={`shrink-0 border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
              active === tab.id ? "border-signal text-signal-text" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{children(active)}</div>
    </div>
  );
}
