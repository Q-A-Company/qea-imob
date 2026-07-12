import { Activity, Building2, Home } from "lucide-react";
import { colorForCompetitor } from "@/lib/categorical-colors";
import { Card, CardHeader } from "../../card";
import { RankingBars } from "../../mini-charts";
import { KpiCard } from "../kpi-card";
import type { ReportIndicators } from "./get-report-data";

// previous=0 → percentual sem sentido (mesmo princípio de
// admin/dashboard-client.tsx). previousPeriod null → sem from/to definidos,
// sem período anterior bem definido (decisão confirmada com o usuário) —
// os dois casos resultam em `undefined`/omitir o indicador.
function computePercentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// Bloco de indicadores de Relatórios — reage aos MESMOS filtros que a
// tabela abaixo (indicators já vem calculado sobre o conjunto filtrado
// inteiro, não paginado). Os outros gráficos que existiam aqui (Horários
// com mais alterações, Imóveis mais voláteis, Evolução no tempo,
// Distribuição por concorrente, Direção das mudanças) foram removidos a
// pedido do usuário — os dois primeiros mudaram pro Painel (ver
// admin/hourly-volume-chart.tsx e admin/volatile-properties-card.tsx), os
// outros três só foram descartados mesmo.
export function ReportCharts({ indicators }: { indicators: ReportIndicators }) {
  if (indicators.totalChanges === 0) {
    return (
      <Card>
        <p className="text-sm text-muted">Nenhuma mudança no período/filtros selecionados — sem dados pra mostrar nos indicadores.</p>
      </Card>
    );
  }

  return (
    // Os 2 KPIs e o gráfico ficam lado a lado, na MESMA linha (pedido
    // explícito do usuário — nada empilhado). 4 colunas em telas largas:
    // cada KPI ocupa 1, o gráfico ocupa as 2 restantes. Em telas estreitas
    // cai pra 1 coluna só (empilha) — inevitável pra continuar responsivo,
    // não dá pra manter 3 blocos lado a lado num celular.
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
      <KpiCard
        icon={Activity}
        label="Mudanças no período"
        value={indicators.totalChanges}
        percentChange={
          indicators.previousPeriod && computePercentChange(indicators.totalChanges, indicators.previousPeriod.totalChanges)
        }
      />
      <KpiCard
        icon={Home}
        label="Imóveis alterados"
        value={indicators.uniquePropertiesChanged}
        delay={0.08}
        percentChange={
          indicators.previousPeriod &&
          computePercentChange(indicators.uniquePropertiesChanged, indicators.previousPeriod.uniquePropertiesChanged)
        }
      />
      <Card className="sm:col-span-2">
        <CardHeader icon={Building2} title="Alterações por concorrente" />
        <RankingBars
          entries={indicators.byCompetitor.map((c) => ({
            label: c.abbreviation,
            sublabel: c.name,
            count: c.count,
            color: colorForCompetitor(c.competitorId),
          }))}
        />
      </Card>
    </div>
  );
}
