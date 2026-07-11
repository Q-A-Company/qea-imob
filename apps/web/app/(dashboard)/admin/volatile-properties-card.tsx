import { RankingBars } from "../mini-charts";
import { InfoTooltip } from "../info-tooltip";
import { colorForCompetitor } from "@/lib/categorical-colors";
import type { VolatileProperty } from "./get-dashboard-data";

// Movido de Relatórios pro Painel a pedido do usuário — mesma janela fixa
// de 30 dias do HourlyVolumeChart (ver comentário lá).
export function VolatilePropertiesCard({ properties }: { properties: VolatileProperty[] }) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-surface-border bg-surface p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-muted">
        Imóveis mais voláteis · 30 dias
        <InfoTooltip text="Imóveis com mais mudanças de preço registradas nos últimos 30 dias — indicativo de precificação dinâmica ou possível erro de captura." />
      </h3>
      {properties.length === 0 ? (
        <p className="text-sm text-muted">Nenhuma mudança nos últimos 30 dias.</p>
      ) : (
        <RankingBars
          entries={properties.map((p) => ({
            label: p.externalId,
            sublabel: `${p.abbreviation} · ${p.externalId}`,
            count: p.count,
            color: colorForCompetitor(p.competitorId),
          }))}
        />
      )}
    </div>
  );
}
