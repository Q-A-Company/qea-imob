"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { periodOfDay } from "@/lib/greeting";
import { useCountUp } from "./use-count-up";
import { ChangesFeed } from "./changes-feed";
import { VolumeChart } from "./volume-chart";
import { CompetitorPieChart } from "./competitor-pie-chart";
import { HourlyVolumeChart } from "./hourly-volume-chart";
import { VolatilePropertiesCard } from "./volatile-properties-card";
import { EmptyState } from "./empty-state";
import type { DashboardData } from "./get-dashboard-data";

function KpiNumber({ value, delay }: { value: number; delay: number }) {
  const animated = useCountUp(value, { delay });
  return <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{animated}</span>;
}

function KpiCard({ label, value, delay, hero }: { label: string; value: number; delay: number; hero?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-surface-border bg-surface p-4">
      {hero && <div className="radar-sweep" aria-hidden />}
      <div className="relative z-10">
        <p className="text-xs font-medium text-muted">{label}</p>
        <div className="mt-1.5">
          <KpiNumber value={value} delay={delay} />
        </div>
      </div>
    </div>
  );
}

// canManage=false pra role Usuario (Etapa 11) — dashboard em si é
// só-leitura pros dois roles, então a única diferença de verdade é o CTA do
// estado vazio (ver empty-state.tsx).
export function DashboardClient({
  data,
  fullName,
  canManage = true,
}: {
  data: DashboardData;
  fullName: string | null;
  canManage?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const [greeting, setGreeting] = useState<string | null>(null);

  useEffect(() => {
    setGreeting(periodOfDay(new Date().getHours()));
  }, []);

  const firstName = fullName?.trim().split(/\s+/)[0] ?? null;

  const container = reduceMotion
    ? { hidden: { opacity: 1 }, shown: { opacity: 1 } }
    : {
        hidden: { opacity: 0 },
        shown: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
      };

  const item = reduceMotion
    ? { hidden: { opacity: 1, y: 0 }, shown: { opacity: 1, y: 0 } }
    : {
        hidden: { opacity: 0, y: 10 },
        shown: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
      };

  return (
    <motion.div initial="hidden" animate="shown" variants={container} className="flex flex-col gap-4">
      <motion.div variants={item}>
        <h1 className="font-display text-3xl font-medium text-foreground">
          {greeting ? `${greeting.charAt(0).toUpperCase()}${greeting.slice(1)}` : "Olá"}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted">Aqui está o que mudou nos preços dos seus concorrentes.</p>
      </motion.div>

      {!data.hasCompetitors ? (
        <motion.div variants={item}>
          <EmptyState canManage={canManage} />
        </motion.div>
      ) : (
        <>
          <motion.div variants={item} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Mudanças · última 1h" value={data.changes1h} delay={reduceMotion ? 0 : 0.1} />
            <KpiCard label="Mudanças · 24h" value={data.changes24h} delay={reduceMotion ? 0 : 0.18} hero />
            <KpiCard label="Mudanças · 7 dias" value={data.changes7d} delay={reduceMotion ? 0 : 0.26} />
            <KpiCard label="Concorrentes ativos" value={data.activeCompetitorsCount} delay={reduceMotion ? 0 : 0.34} />
          </motion.div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:grid-rows-2">
            <motion.div variants={item} className="lg:col-span-2 lg:row-span-2">
              <ChangesFeed feed={data.feed} />
            </motion.div>
            <motion.div variants={item}>
              <CompetitorPieChart breakdownByWindow={data.breakdownByWindow} />
            </motion.div>
            <motion.div variants={item}>
              <VolumeChart dailyVolumes={data.dailyVolumes} />
            </motion.div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <motion.div variants={item}>
              <HourlyVolumeChart hourlyVolumes={data.hourlyVolumes30d} />
            </motion.div>
            <motion.div variants={item}>
              <VolatilePropertiesCard properties={data.topVolatileProperties30d} />
            </motion.div>
          </div>
        </>
      )}
    </motion.div>
  );
}
