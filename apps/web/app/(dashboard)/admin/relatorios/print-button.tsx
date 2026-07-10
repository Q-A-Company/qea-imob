"use client";

import { useTransition } from "react";
import { logReportGeneratedAction } from "./actions";
import type { ReportFilters } from "./get-report-data";

// filters: só pra registrar no audit_log COM QUE FILTROS o relatório foi
// gerado — não afeta a impressão em si. O log é fire-and-forget (startTransition
// sem esperar) — não atrasa nem depende do window.print(), que já dispara
// imediatamente.
export function PrintButton({ filters }: { filters: ReportFilters }) {
  const [, startTransition] = useTransition();

  function handleClick() {
    window.print();
    startTransition(() => {
      logReportGeneratedAction({
        competitorIds: filters.competitorIds,
        from: filters.from,
        to: filters.to,
        types: filters.types,
      });
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="print:hidden rounded-md border border-surface-border px-3 py-1.5 text-sm text-muted hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
    >
      Imprimir / Exportar PDF
    </button>
  );
}
