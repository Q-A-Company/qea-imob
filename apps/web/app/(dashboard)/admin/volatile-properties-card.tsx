import { Flame } from "lucide-react";
import { RankingBars } from "../mini-charts";
import { PropertyReferenceLink } from "../property-reference-link";
import { IconChip } from "../icon-chip";
import { colorForCompetitor } from "@/lib/categorical-colors";
import type { VolatileProperty } from "./get-dashboard-data";

// Movido de Relatórios pro Painel a pedido do usuário — mesma janela fixa
// de 30 dias do HourlyVolumeChart (ver comentário lá).
export function VolatilePropertiesCard({ properties }: { properties: VolatileProperty[] }) {
  return (
    <div className="flex flex-col rounded-lg border border-surface-border bg-surface p-4">
      <h3 className="mb-3 flex items-center gap-2.5 text-sm font-medium text-muted">
        <IconChip icon={Flame} />
        Imóveis mais voláteis · 30 dias
      </h3>
      {properties.length === 0 ? (
        <p className="text-sm text-muted">Nenhuma mudança nos últimos 30 dias.</p>
      ) : (
        <RankingBars
          entries={properties.map((p) => ({
            label: <PropertyReferenceLink referenceCode={p.referenceCode} url={p.url} />,
            sublabel: `${p.abbreviation} · ${p.referenceCode ?? "sem código"}`,
            count: p.count,
            color: colorForCompetitor(p.competitorId),
          }))}
        />
      )}
    </div>
  );
}
