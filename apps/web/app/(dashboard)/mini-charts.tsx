"use client";

import { motion } from "motion/react";

// Compartilhado entre o painel (Horários/Voláteis) e Relatórios (Alterações
// por concorrente) — mesma forma visual (barra proporcional ao maior
// valor), dados diferentes em cada uso. Movido pra cá (era local a
// report-charts.tsx) quando os gráficos de Horários/Voláteis passaram do
// Relatórios pro Painel, pra não duplicar a implementação nos dois lugares.
export function RankingBars({ entries }: { entries: { label: string; sublabel?: string; count: number; color?: string }[] }) {
  const max = Math.max(1, ...entries.map((e) => e.count));
  return (
    <ul className="flex flex-col gap-2">
      {entries.map((e, i) => (
        <li key={`${e.label}-${i}`} className="flex items-center gap-2">
          <span className="w-16 shrink-0 truncate font-mono text-xs font-semibold text-foreground" title={e.sublabel ?? e.label}>
            {e.label}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-background">
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: e.count / max }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              style={{ transformOrigin: "left", backgroundColor: e.color ?? "var(--color-graphite)" }}
              className="h-full rounded-full"
            />
          </div>
          <span className="w-6 shrink-0 text-right font-mono text-xs text-muted">{e.count}</span>
        </li>
      ))}
    </ul>
  );
}

export function VerticalBars({ entries }: { entries: { label: string; count: number }[] }) {
  const max = Math.max(1, ...entries.map((e) => e.count));
  return (
    <div className="flex h-24 min-w-full items-end gap-1">
      {entries.map((e, i) => {
        // Signal Amber é exclusivo pra sinalizar "mudança detectada" — aqui
        // só o(s) pico(s) usa(m) a cor, o resto fica neutro (mesmo padrão de
        // admin/volume-chart.tsx), em vez de toda barra vir colorida.
        const isPeak = e.count > 0 && e.count === max;
        return (
          <div key={`${e.label}-${i}`} className="flex h-full flex-1 min-w-3 flex-col items-center justify-end gap-1">
            <div className="flex h-full w-full items-end justify-center">
              <motion.div
                initial={{ scaleY: 0 }}
                animate={{ scaleY: Math.max(0.03, e.count / max) }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                style={{ transformOrigin: "bottom" }}
                className={`w-full max-w-4 rounded-t-sm ${isPeak ? "bg-signal" : "bg-muted/40"}`}
                title={`${e.label}: ${e.count}`}
              />
            </div>
            <span className="whitespace-nowrap text-[9px] text-muted">{e.label}</span>
          </div>
        );
      })}
    </div>
  );
}
