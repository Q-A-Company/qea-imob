import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Substitui os 5 "‹ Anterior / Página X de Y / Próxima ›" idênticos que
// existiam espalhados (history-content.tsx, notifications-content.tsx,
// report-table.tsx, account-activity-list.tsx, superadmin errors/page.tsx)
// por números de página clicáveis, referência visual: quadrados
// arredondados, página ativa em --signal. Reaproveita os MESMOS tokens já
// estabelecidos — border-surface-border/bg-background (idêntico ao
// IconButton variante "default") pros neutros, bg-signal/text-signal-on
// (mesmo par já usado nos CTAs primários) pra ativa — não existe um
// componente Button genérico no app hoje pra importar, então a reutilização
// acontece no nível dos tokens de cor/borda, não de um componente
// compartilhado que ainda não existe.
//
// Texto "Página X de Y" removido (não existe na referência) — os números
// clicáveis já comunicam a mesma informação, de forma mais útil.
type PageItem = number | "ellipsis";

// Algoritmo padrão de truncamento (mesmo usado por bibliotecas de UI
// consolidadas, tipo MUI) — testado contra vários casos reais antes de
// implementar (ver conversa): sempre mostra a 1ª e a última página, 1
// página de cada lado da atual; perto de uma ponta, a janela se estica pra
// preencher o mesmo espaço em vez de deixar uma reticência escondendo só
// 1-2 páginas (o que ficaria sem sentido). siblingCount/boundaryCount fixos
// em 1 — foi o valor que bateu exatamente com a referência (1,2,3,4,5,…,10).
function buildPageItems(page: number, count: number, siblingCount = 1, boundaryCount = 1): PageItem[] {
  const range = (start: number, end: number) => Array.from({ length: Math.max(end - start + 1, 0) }, (_, i) => start + i);

  const startPages = range(1, Math.min(boundaryCount, count));
  const endPages = range(Math.max(count - boundaryCount + 1, boundaryCount + 1), count);

  const siblingsStart = Math.max(Math.min(page - siblingCount, count - boundaryCount - siblingCount * 2 - 1), boundaryCount + 2);
  const siblingsEnd = Math.min(
    Math.max(page + siblingCount, boundaryCount + siblingCount * 2 + 2),
    endPages.length > 0 ? endPages[0]! - 2 : count - 1
  );

  return [
    ...startPages,
    ...(siblingsStart > boundaryCount + 2 ? (["ellipsis"] as const) : boundaryCount + 1 < count - boundaryCount ? [boundaryCount + 1] : []),
    ...range(siblingsStart, siblingsEnd),
    ...(siblingsEnd < count - boundaryCount - 1 ? (["ellipsis"] as const) : count - boundaryCount > boundaryCount ? [count - boundaryCount] : []),
    ...endPages,
  ];
}

const NEUTRAL_CLASS = "border-surface-border bg-background text-muted hover:border-foreground/30 hover:text-foreground";
const BOX_CLASS =
  "inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md border px-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal";

function PageNumber({ page, active, href }: { page: number; active: boolean; href: string }) {
  if (active) {
    return (
      <span aria-current="page" className={`${BOX_CLASS} border-signal bg-signal font-semibold text-signal-on`}>
        {page}
      </span>
    );
  }
  return (
    <Link href={href} className={`${BOX_CLASS} ${NEUTRAL_CLASS}`}>
      {page}
    </Link>
  );
}

function NavLink({ href, disabled, label, icon: Icon, iconSide }: { href: string; disabled: boolean; label: string; icon: typeof ChevronLeft; iconSide: "left" | "right" }) {
  const sharedClass = `inline-flex h-8 shrink-0 items-center gap-1 rounded-md border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${NEUTRAL_CLASS}`;
  const content = (
    <>
      {iconSide === "left" && <Icon className="h-4 w-4" aria-hidden />}
      {label}
      {iconSide === "right" && <Icon className="h-4 w-4" aria-hidden />}
    </>
  );
  if (disabled) {
    return (
      <span className={`${sharedClass} pointer-events-none opacity-40`} aria-disabled="true">
        {content}
      </span>
    );
  }
  return (
    <Link href={href} className={sharedClass}>
      {content}
    </Link>
  );
}

export function Pagination({
  page,
  totalPages,
  buildUrl,
  className = "",
}: {
  page: number;
  totalPages: number;
  buildUrl: (page: number) => string;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  const items = buildPageItems(page, totalPages);

  return (
    <nav aria-label="Paginação" className={`flex flex-wrap items-center justify-center gap-1.5 ${className}`}>
      <NavLink href={buildUrl(Math.max(1, page - 1))} disabled={page <= 1} label="Anterior" icon={ChevronLeft} iconSide="left" />
      {items.map((item, i) =>
        item === "ellipsis" ? (
          <span key={`ellipsis-${i}`} className={`${BOX_CLASS} border-transparent`} aria-hidden>
            …
          </span>
        ) : (
          <PageNumber key={item} page={item} active={item === page} href={buildUrl(item)} />
        )
      )}
      <NavLink
        href={buildUrl(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        label="Próxima"
        icon={ChevronRight}
        iconSide="right"
      />
    </nav>
  );
}
