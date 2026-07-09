"use client";

import { motion } from "motion/react";
import type { DailyVolume } from "./get-dashboard-data";

const rowVariants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.06 } },
};

const barVariants = {
  hidden: { scaleY: 0 },
  shown: { scaleY: 1, transition: { duration: 0.5, ease: "easeOut" as const } },
};

function dayLabel(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  return date.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
}

// Barras, não linha — volume de mudanças por dia é uma contagem discreta por
// período, não um valor contínuo que faça sentido interpolar entre um dia e
// o outro (ver plano de design da Etapa 10).
export function VolumeChart({ dailyVolumes }: { dailyVolumes: DailyVolume[] }) {
  const max = Math.max(1, ...dailyVolumes.map((d) => d.count));
  const peakIndex = dailyVolumes.reduce(
    (peak, d, i) => (d.count > dailyVolumes[peak]!.count ? i : peak),
    0
  );
  const hasAnyChange = dailyVolumes.some((d) => d.count > 0);

  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4">
      <h3 className="mb-4 text-sm font-medium text-muted">Volume de mudanças — últimos 7 dias</h3>
      <motion.div variants={rowVariants} className="flex h-32 items-end justify-between gap-2">
        {dailyVolumes.map((d, i) => {
          const isPeak = hasAnyChange && i === peakIndex;
          const heightPct = Math.max(4, (d.count / max) * 100);
          return (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-full w-full items-end justify-center">
                <motion.div
                  variants={barVariants}
                  style={{ height: `${heightPct}%`, transformOrigin: "bottom" }}
                  className={`w-full max-w-8 rounded-t-sm ${isPeak ? "bg-signal" : "bg-muted/40"}`}
                  title={`${d.count} mudança(s)`}
                />
              </div>
              <span className="text-[11px] text-muted">{dayLabel(d.date)}</span>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}
