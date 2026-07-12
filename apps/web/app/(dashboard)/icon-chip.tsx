import type { LucideIcon } from "lucide-react";

// Ícone de canto do redesign de cards — mesmo chip (tamanho único, não um
// por tipo de card) em qualquer lugar que ganhar esse elemento: KpiCard
// (kpi-card.tsx), cabeçalho de card de gráfico (CardHeader em card.tsx,
// competitor-pie-chart.tsx, hourly-volume-chart.tsx,
// volatile-properties-card.tsx) e cards de perigo (tone="erro" — reforça o
// tom já usado no fundo/borda desses cards, um chip neutro destoaria).
// Extraído porque o mesmo className apareceria repetido em ~10 arquivos
// senão.
export function IconChip({ icon: Icon, tone = "neutral" }: { icon: LucideIcon; tone?: "neutral" | "erro" }) {
  const toneClass = tone === "erro" ? "border-erro/30 bg-erro/10 text-erro-texto" : "border-surface-border bg-background text-foreground";
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${toneClass}`}>
      <Icon className="h-[18px] w-[18px]" aria-hidden />
    </span>
  );
}
