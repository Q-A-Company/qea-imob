"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { colorForCompetitor } from "@/lib/categorical-colors";
import type { CompetitorBreakdownEntry } from "./get-dashboard-data";

type Window = "1h" | "24h" | "7d";
const WINDOWS: { key: Window; label: string }[] = [
  { key: "1h", label: "1h" },
  { key: "24h", label: "24h" },
  { key: "7d", label: "7 dias" },
];

function buildConicGradient(entries: CompetitorBreakdownEntry[]): string {
  const total = entries.reduce((sum, e) => sum + e.count, 0);
  if (total === 0) return "conic-gradient(var(--color-surface-border) 0deg 360deg)";

  let cursor = 0;
  const stops = entries.map((e) => {
    const angle = (e.count / total) * 360;
    const stop = `${colorForCompetitor(e.competitorId)} ${cursor}deg ${cursor + angle}deg`;
    cursor += angle;
    return stop;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

// Cada concorrente tem cor fixa (hash determinístico de competitor_id, ver
// lib/categorical-colors.ts) — a mesma cor sempre, em qualquer gráfico/tela,
// entre sessões. Distribuição por concorrente numa janela selecionável
// responde a uma pergunta diferente do gráfico de barras (tendência no
// tempo): "quem está mudando mais preço, agora".
export function CompetitorPieChart({
  breakdownByWindow,
}: {
  breakdownByWindow: Record<Window, CompetitorBreakdownEntry[]>;
}) {
  const [selected, setSelected] = useState<Window>("24h");
  const entries = breakdownByWindow[selected];
  const total = entries.reduce((sum, e) => sum + e.count, 0);

  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted">Mudanças por concorrente</h3>
        <div className="flex gap-1 rounded-md border border-surface-border p-0.5">
          {WINDOWS.map((w) => (
            <button
              key={w.key}
              type="button"
              onClick={() => setSelected(w.key)}
              className={`rounded px-2 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
                selected === w.key ? "bg-signal text-signal-on" : "text-muted hover:text-foreground"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {total === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Nenhuma mudança nessa janela.</p>
      ) : (
        <div className="flex items-center gap-6">
          <motion.div
            key={selected}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="h-32 w-32 shrink-0 rounded-full"
            style={{ background: buildConicGradient(entries) }}
            aria-hidden
          />
          <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
            {entries.map((e) => (
              <li key={e.competitorId} className="flex items-center gap-2 text-sm" title={e.name}>
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colorForCompetitor(e.competitorId) }}
                  aria-hidden
                />
                <span className="font-mono text-xs font-semibold text-foreground">{e.abbreviation}</span>
                <span className="truncate text-xs text-muted">{e.name}</span>
                <span className="ml-auto shrink-0 font-mono text-xs text-muted">{e.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
