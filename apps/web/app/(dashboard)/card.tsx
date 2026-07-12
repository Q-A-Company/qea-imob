import type { LucideIcon } from "lucide-react";
import { IconChip } from "./icon-chip";

// Primitivo compartilhado pra reformulação visual (referência de estrutura:
// platform.claude.com/dashboard — cards com borda sutil, espaçamento
// generoso). Consolida a receita que já existia repetida ad-hoc em ~16
// arquivos (`rounded-lg border border-surface-border bg-surface p-4`) numa
// única fonte, sem inventar cor/token novo — reaproveita os já existentes
// em globals.css.
export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-surface-border bg-surface p-5 ${className}`}>{children}</div>;
}

// icon opcional — arquétipo B do redesign de cards (gráficos/visualizações):
// ganham o ícone de canto (mesmo IconChip do KpiCard), mas sem número
// grande/fantasma/percentual, que não fazem sentido pra um card que já
// mostra o dado como gráfico.
export function CardHeader({
  icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="flex items-center gap-2.5">
        {icon && <IconChip icon={icon} />}
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
