import { formatBRL } from "@/lib/format";
import type { RunChangeDetail } from "@/lib/scraper-runs/get-run-changes";

const CHANGE_TYPE_LABEL: Record<RunChangeDetail["changeType"], string> = {
  price: "Preço",
  added: "Adicionado",
  removed: "Possiv. vendido",
  reappeared: "Reapareceu",
};

// added/reappeared = boa notícia (verde/sucesso); removed = alerta
// (vermelho/erro); price fica neutro (nem toda mudança de preço é boa ou
// ruim, pode ser aumento ou redução).
const CHANGE_TYPE_BADGE_CLASS: Record<RunChangeDetail["changeType"], string> = {
  price: "bg-background text-muted",
  added: "bg-sucesso/15 text-sucesso-texto",
  removed: "bg-erro/15 text-erro-texto",
  reappeared: "bg-sucesso/15 text-sucesso-texto",
};

// Mesma lógica de formatação de report-table.tsx (delta %, tachado →
// destacado) — reaproveitada aqui pro painel de detalhe de uma execução,
// não duplicada do zero.
function formatDelta(oldPrice: number | null, newPrice: number | null): string {
  if (oldPrice === null || newPrice === null || oldPrice === 0) return "—";
  const pct = ((newPrice - oldPrice) / oldPrice) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

export function PropertyChangeRow({ change }: { change: RunChangeDetail }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-1.5 text-xs">
      <span className="flex items-center gap-2">
        <span className="font-mono text-foreground">{change.externalId}</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${CHANGE_TYPE_BADGE_CLASS[change.changeType]}`}>
          {CHANGE_TYPE_LABEL[change.changeType]}
        </span>
      </span>
      {change.changeType === "price" ? (
        <span className="flex items-center gap-1.5 font-mono">
          <span className="text-muted line-through">{formatBRL(change.oldPrice)}</span>
          <span className="text-muted">→</span>
          <span className="font-semibold text-signal-text">{formatBRL(change.newPrice)}</span>
          <span className="text-muted">({formatDelta(change.oldPrice, change.newPrice)})</span>
        </span>
      ) : change.changeType === "added" ? (
        <span className="font-mono font-semibold text-sucesso-texto">{formatBRL(change.newPrice)}</span>
      ) : (
        <span className="text-muted">—</span>
      )}
    </li>
  );
}
