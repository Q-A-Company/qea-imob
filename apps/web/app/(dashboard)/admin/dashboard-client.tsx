"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Activity, Target } from "lucide-react";
import { periodOfDay } from "@/lib/greeting";
import { KpiCard } from "./kpi-card";
import { ChangesFeed } from "./changes-feed";
import { CompetitorPieChart } from "./competitor-pie-chart";
import { HourlyVolumeChart } from "./hourly-volume-chart";
import { VolatilePropertiesCard } from "./volatile-properties-card";
import { EmptyState } from "./empty-state";
import type { DashboardData } from "./get-dashboard-data";

// previous=0 → percentual seria infinito/sem sentido ("+∞%" a partir de
// zero) — omite (null) em vez de mostrar um número enganoso, mesmo
// princípio já usado pra "Concorrentes ativos" (sem período anterior
// aplicável) e pro indicador de Relatórios (sem from/to definidos).
function computePercentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
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
        {/* font-bold (700, não o font-medium/500 anterior) — papel de
            "destaque" da tipografia do redesign: mesma família (BR Sonoma),
            só um peso mais pesado, usado com moderação (aqui e nos dígitos
            do Placar, ver flip-number.tsx) em vez de uma segunda família
            só pra título. */}
        <h1 className="font-display text-3xl font-bold text-foreground">
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
          {/* Duas colunas a partir de lg: feed (com os 2 indicadores acima
              dele) à esquerda, coluna de 3 gráficos compactos à direita.
              Cada card tem um tamanho PADRÃO fixo (h-[480px] no feed, h-60
              nos 3 gráficos) — pedido explícito pra desacoplar as duas
              colunas: se o feed tiver muitas linhas, ele não estica os
              cards de gráfico pra acompanhar (o feed só rola por dentro,
              via overflow-y-auto que já existe em changes-feed.tsx); se o
              feed tiver poucas linhas, os cards de gráfico não encolhem
              pra caber nele — cada lado só ocupa o próprio tamanho padrão,
              podendo terminar mais alto ou mais baixo que o outro.
              items-start (não o items-stretch padrão do grid) garante que
              nenhuma coluna force altura na outra. */}
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
            <motion.div variants={item} className="flex flex-col gap-4 lg:col-span-2">
              <div className="grid grid-cols-2 gap-3">
                <KpiCard
                  icon={Activity}
                  label="Mudanças nas últimas 24 horas"
                  value={data.changes24h}
                  delay={reduceMotion ? 0 : 0.1}
                  percentChange={computePercentChange(data.changes24h, data.changesPrevious24h)}
                />
                {/* Sem percentChange — "concorrentes ativos" é uma foto do
                    agora, não existe uma comparação de período com sentido
                    real (decisão confirmada com o usuário). */}
                <KpiCard icon={Target} label="Concorrentes ativos" value={data.activeCompetitorsCount} delay={reduceMotion ? 0 : 0.18} />
              </div>
              <div className="h-[480px]">
                <ChangesFeed feed={data.feed} />
              </div>
            </motion.div>

            {/* Mudanças por concorrente continua com altura fixa (h-56, um
                pouco menor que antes) — sempre tem pizza + legenda, faz
                sentido ter um tamanho estável. Horários/Voláteis, não: cada
                um tem no máximo 5 linhas (RankingBars), então a altura deles
                varia com a quantidade de dados de verdade — sem wrapper de
                altura fixa, cada card só ocupa o que precisa (ver h-full
                removido dos componentes em si). */}
            <motion.div variants={item} className="flex flex-col gap-4">
              <div className="h-56">
                <CompetitorPieChart breakdownByWindow={data.breakdownByWindow} />
              </div>
              <HourlyVolumeChart hourlyVolumes={data.hourlyVolumes30d} />
              <VolatilePropertiesCard properties={data.topVolatileProperties30d} />
            </motion.div>
          </div>
        </>
      )}
    </motion.div>
  );
}
