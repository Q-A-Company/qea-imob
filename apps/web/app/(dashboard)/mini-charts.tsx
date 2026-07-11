"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";

// Compartilhado entre o painel (Horários/Voláteis) e Relatórios (Alterações
// por concorrente) — mesma forma visual (barra proporcional ao maior
// valor), dados diferentes em cada uso. Movido pra cá (era local a
// report-charts.tsx) quando os gráficos de Horários/Voláteis passaram do
// Relatórios pro Painel, pra não duplicar a implementação nos dois lugares.
//
// label é ReactNode (não só string) — Imóveis mais voláteis passa um
// PropertyReferenceLink como label (código clicável); Horários continua
// passando string simples, sem mudança nenhuma no uso dele.
export interface RankingBarEntry {
  label: ReactNode;
  sublabel?: string;
  count: number;
  color?: string;
}

export function RankingBars({ entries }: { entries: RankingBarEntry[] }) {
  const max = Math.max(1, ...entries.map((e) => e.count));
  return (
    <ul className="flex flex-col gap-2">
      {entries.map((e, i) => (
        <li key={i} className="flex items-center gap-2">
          <span
            className="w-16 shrink-0 truncate font-mono text-xs font-semibold text-foreground"
            title={e.sublabel ?? (typeof e.label === "string" ? e.label : undefined)}
          >
            {e.label}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-background">
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: e.count / max }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              style={{ transformOrigin: "left", backgroundColor: e.color ?? "var(--color-grafite)" }}
              className="h-full rounded-full"
            />
          </div>
          <span className="w-6 shrink-0 text-right font-mono text-xs text-muted">{e.count}</span>
        </li>
      ))}
    </ul>
  );
}
