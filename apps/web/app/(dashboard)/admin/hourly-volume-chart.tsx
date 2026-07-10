import { VerticalBars } from "../mini-charts";
import type { HourlyVolume } from "./get-dashboard-data";

function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}h`;
}

// Movido de Relatórios pro Painel a pedido do usuário — janela fixa de 30
// dias (era filtrável em Relatórios; aqui não tem filtro nenhum, então
// escolhemos uma janela larga o bastante pra ter amostra significativa).
// Hora em UTC, mesma simplificação já usada em get-dashboard-data.ts.
export function HourlyVolumeChart({ hourlyVolumes }: { hourlyVolumes: HourlyVolume[] }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4">
      <h3 className="mb-4 text-sm font-medium text-muted">Horários com mais alterações · 30 dias</h3>
      <VerticalBars entries={hourlyVolumes.map((h) => ({ label: formatHourLabel(h.hour), count: h.count }))} />
    </div>
  );
}
