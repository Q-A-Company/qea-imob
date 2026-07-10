import { colorForCompetitor } from "@/lib/categorical-colors";
import { Card, CardHeader } from "../../card";
import { RankingBars } from "../../mini-charts";
import type { ReportIndicators } from "./get-report-data";

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
      <Card className="p-4">
        <p className="text-xs text-muted">Mudanças no período</p>
        <p className="mt-1 font-mono text-2xl font-semibold text-foreground">{indicators.totalChanges}</p>
      </Card>
      <Card className="p-4">
        <p className="text-xs text-muted">Imóveis alterados</p>
        <p className="mt-1 font-mono text-2xl font-semibold text-foreground">{indicators.uniquePropertiesChanged}</p>
      </Card>
      <Card className="sm:col-span-2">
        <CardHeader title="Alterações por concorrente" />
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
