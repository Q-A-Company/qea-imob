import { RankingBars } from "../mini-charts";
import { InfoTooltip } from "../info-tooltip";
import type { HourlyVolume } from "./get-dashboard-data";

const TOP_LIMIT = 5;

function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}h`;
}

// Movido de Relatórios pro Painel a pedido do usuário — janela fixa de 30
// dias (era filtrável em Relatórios; aqui não tem filtro nenhum, então
// escolhemos uma janela larga o bastante pra ter amostra significativa).
// Hora em UTC, mesma simplificação já usada em get-dashboard-data.ts.
//
// Só os horários com pelo menos 1 mudança, top 5 — a versão anterior
// desenhava as 24 horas fixas (a maioria zerada na prática, com poucas
// mudanças/dia), o que parecia quebrado. RankingBars (mesmo padrão dos
// outros 2 gráficos da coluna) em vez de 24 colunas fixas.
export function HourlyVolumeChart({ hourlyVolumes }: { hourlyVolumes: HourlyVolume[] }) {
  const top = hourlyVolumes
    .filter((h) => h.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_LIMIT);

  return (
    <div className="flex flex-col rounded-lg border border-surface-border bg-surface p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-muted">
        Horários com mais alterações · 30 dias
        <InfoTooltip text="Os horários do dia (UTC) com mais mudanças de preço detectadas, somando os últimos 30 dias." />
      </h3>
      {top.length === 0 ? (
        <p className="text-sm text-muted">Nenhuma mudança nos últimos 30 dias.</p>
      ) : (
        <RankingBars entries={top.map((h) => ({ label: formatHourLabel(h.hour), count: h.count }))} />
      )}
    </div>
  );
}
