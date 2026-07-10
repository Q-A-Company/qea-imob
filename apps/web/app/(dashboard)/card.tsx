// Primitivo compartilhado pra reformulação visual (referência de estrutura:
// platform.claude.com/dashboard — cards com borda sutil, espaçamento
// generoso). Consolida a receita que já existia repetida ad-hoc em ~16
// arquivos (`rounded-lg border border-surface-border bg-surface p-4`) numa
// única fonte, sem inventar cor/token novo — reaproveita os já existentes
// em globals.css.
export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-surface-border bg-surface p-5 ${className}`}>{children}</div>;
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
