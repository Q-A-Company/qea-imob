"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { periodOfDay } from "@/lib/greeting";
import { useCountUp } from "./use-count-up";
import { ChangesFeed } from "./changes-feed";
import { CompetitorPieChart } from "./competitor-pie-chart";
import { HourlyVolumeChart } from "./hourly-volume-chart";
import { VolatilePropertiesCard } from "./volatile-properties-card";
import { EmptyState } from "./empty-state";
import { InfoTooltip } from "../info-tooltip";
import type { DashboardData } from "./get-dashboard-data";

function KpiNumber({ value, delay }: { value: number; delay: number }) {
  const animated = useCountUp(value, { delay });
  return <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{animated}</span>;
}

const RADAR_ROTATION_SECONDS = 9;
const MAX_RADAR_BLIPS = 12; // acima disso os pontos ficam amontoados/confusos num círculo pequeno
const BLIP_RADIUS_MIN_PX = 20;
const BLIP_RADIUS_MAX_PX = 32;

// Hash determinístico (mesmo índice → sempre o mesmo valor) só pra variar o
// raio de cada blip sem ficarem todos "na mesma reta" (2 blips diametralmente
// opostos, mesmo raio, formam uma linha reta passando pelo centro — visual
// que o usuário pediu pra quebrar). Math.random() de verdade quebraria a
// hidratação SSR (servidor e cliente sorteariam valores diferentes pro mesmo
// blip); truque clássico de hash via seno dá uma fração "com cara de
// aleatória" que é, na prática, pura função do índice.
function pseudoRandomFraction(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// Um ponto por concorrente ativo (mesma contagem que já alimenta o card
// "Concorrentes ativos" ao lado — não busca de novo), distribuído
// uniformemente ao redor do círculo, cada um a um raio levemente diferente
// (--blip-radius, 20–32px) pra não parecerem enfileirados. --blip-angle/
// --blip-delay (custom properties, lidas pelo CSS em globals.css) fazem cada
// ponto "acender" exatamente no instante em que o feixe (9s por volta) cruza
// sua posição angular: delay = (ângulo / 360) × duração da rotação.
function RadarBlips({ count }: { count: number }) {
  const n = Math.min(count, MAX_RADAR_BLIPS);
  if (n <= 0) return null;

  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const angle = (360 / n) * i;
        const delay = (angle / 360) * RADAR_ROTATION_SECONDS;
        // .toFixed(1): Math.sin() pode divergir na 13ª+ casa decimal entre o
        // V8 do servidor (Node) e o do navegador (mesma engine, builds
        // diferentes) — sem arredondar, essa diferença ínfima já basta pro
        // React acusar mismatch de hidratação (valor veio diferente no HTML
        // do servidor vs. o que o cliente calculou de novo). Arredondar a 1
        // casa decimal elimina a divergência (bem maior que a margem de erro
        // observada) sem efeito visual perceptível no raio.
        const radius = (BLIP_RADIUS_MIN_PX + pseudoRandomFraction(i + 1) * (BLIP_RADIUS_MAX_PX - BLIP_RADIUS_MIN_PX)).toFixed(1);
        return (
          <span
            key={i}
            className="radar-blip"
            style={
              {
                "--blip-angle": `${angle}deg`,
                "--blip-delay": `${delay}s`,
                "--blip-radius": `-${radius}px`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </>
  );
}

// Substituiu os 4 cards antigos (1h/24h/7d/concorrentes) — reformulação do
// Painel pediu só 2 indicadores simples, mesma largura do feed, acima dele.
// O radar-sweep (varredura) continua existindo, só que agora na cor
// --color-sinal nova — associado ao indicador de 24h (hero), com um blip
// por concorrente ativo (ver RadarBlips acima).
function KpiCard({
  label,
  value,
  delay,
  hero,
  blipCount,
  tooltip,
}: {
  label: string;
  value: number;
  delay: number;
  hero?: boolean;
  blipCount?: number;
  tooltip: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-surface-border bg-surface p-4">
      {hero && (
        <div className="radar-sweep" aria-hidden>
          <RadarBlips count={blipCount ?? 0} />
        </div>
      )}
      <div className="relative z-10">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
          {label}
          <InfoTooltip text={tooltip} />
        </p>
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
                  label="Mudanças nas últimas 24 horas"
                  value={data.changes24h}
                  delay={reduceMotion ? 0 : 0.1}
                  hero
                  blipCount={data.activeCompetitorsCount}
                  tooltip="Mudanças de preço, imóveis adicionados/removidos detectadas nas últimas 24 horas, somando todos os concorrentes ativos."
                />
                <KpiCard
                  label="Concorrentes ativos"
                  value={data.activeCompetitorsCount}
                  delay={reduceMotion ? 0 : 0.18}
                  tooltip="Concorrentes com monitoramento ativo agora (não pausados)."
                />
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
