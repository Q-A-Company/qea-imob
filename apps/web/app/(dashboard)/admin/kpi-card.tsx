import type { LucideIcon } from "lucide-react";
import { FlipNumber } from "./flip-number";
import { IconChip } from "../icon-chip";

// Arquétipo A do redesign de cards (referência: "Draggable Stat Cards" —
// só a linguagem visual, sem a funcionalidade de arrastar/reordenar, que
// nunca foi pedida). 4 elementos, nem todos sempre presentes:
// 1. Ícone pequeno em chip arredondado, canto superior esquerdo, + label
// 2. Número grande (Placar/FlipNumber, já existia — só a moldura mudou)
// 3. Ícone "fantasma" grande e sutil, canto inferior direito — MESMO ícone
//    do chip, só maior/quase transparente (decisão: um vocabulário só de
//    ícone por card, não dois diferentes)
// 4. Indicador percentual, canto inferior direito — SEMPRE em --signal
//    (latão), nunca verde/vermelho condicional: as métricas deste produto
//    (volume de mudanças detectadas) não têm uma polaridade clara de
//    bom/ruim como receita/despesa teriam — usar verde/vermelho aqui
//    implicaria um julgamento que não existe de verdade. `null`/`undefined`
//    omite o indicador por completo (ex: "Concorrentes ativos", que não tem
//    "período anterior" com sentido).
export function KpiCard({
  icon: Icon,
  label,
  value,
  delay = 0,
  percentChange,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  delay?: number;
  percentChange?: number | null;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-surface-border bg-surface p-5">
      <Icon className="pointer-events-none absolute -right-3 -bottom-3 h-24 w-24 text-signal opacity-[0.07]" aria-hidden />

      <div className="relative flex items-center gap-2.5">
        <IconChip icon={Icon} />
        <span className="text-xs font-medium text-muted">{label}</span>
      </div>

      <div className="relative mt-4">
        <FlipNumber value={value} delay={delay} className="text-3xl text-foreground" />
      </div>

      {percentChange != null && (
        <p className="relative mt-1.5 text-right text-xs font-semibold text-signal-text">
          {percentChange >= 0 ? "+" : ""}
          {percentChange.toFixed(1)}%
        </p>
      )}
    </div>
  );
}
