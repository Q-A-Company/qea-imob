import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";
import { formatDuration } from "@/lib/format";
import { getRunChangesByRunId } from "@/lib/scraper-runs/get-run-changes";
import { ExpandableRow } from "@/app/(dashboard)/expandable-row";
import { PropertyChangeRow } from "@/app/(dashboard)/property-change-row";
import { getAccountErrorRuns, ERROR_RUNS_PAGE_SIZE } from "../get-account-error-runs";

const RUN_TYPE_LABEL: Record<string, string> = {
  checagem: "Checagem",
  recalibracao: "Recalibração",
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR");
}

export default async function AccountErrorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  await requireRole("superadmin");
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const page = Math.max(1, Number(resolvedSearchParams.page) || 1);

  const { runs, totalCount } = await getAccountErrorRuns(id, page);
  const totalPages = Math.max(1, Math.ceil(totalCount / ERROR_RUNS_PAGE_SIZE));
  const changesByRunId = await getRunChangesByRunId(runs.map((r) => r.id));

  function buildUrl(p: number): string {
    return `/superadmin/accounts/${id}/errors?page=${p}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Relatório de erros</h1>
        <p className="mt-1 text-sm text-muted">
          Execuções que falharam ou pararam cedo por erro — para diagnosticar um concorrente sem abrir o Supabase direto.
        </p>
      </div>

      {runs.length === 0 && <p className="text-sm text-muted">Nenhuma execução com erro registrada para esta conta.</p>}

      {runs.length > 0 && (
        <ul className="divide-y divide-surface-border rounded-lg border border-surface-border bg-surface">
          {runs.map((run) => {
            const changes = changesByRunId.get(run.id) ?? [];
            return (
              <ExpandableRow
                key={run.id}
                summary={
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {run.competitorName}
                        <span className="ml-2 text-xs font-normal text-muted">{RUN_TYPE_LABEL[run.runType] ?? run.runType}</span>
                        {!run.success && (
                          <span className="ml-2 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-500">FALHOU</span>
                        )}
                        {run.stoppedEarlyDueToError && (
                          <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                            PAROU CEDO
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {run.propertiesCaptured} imóveis capturados
                        {run.errorMessage ? ` · erro: ${run.errorMessage}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
                      <span>{formatDuration(run.durationMs)}</span>
                      <span>{formatDateTime(run.createdAt)}</span>
                    </div>
                  </div>
                }
              >
                {changes.length === 0 ? (
                  <p className="text-xs text-muted">Nenhum imóvel mudou nesta execução.</p>
                ) : (
                  <ul className="divide-y divide-surface-border rounded-md border border-surface-border bg-background px-3">
                    {changes.map((change) => (
                      <PropertyChangeRow key={change.id} change={change} />
                    ))}
                  </ul>
                )}
              </ExpandableRow>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Link
            href={buildUrl(Math.max(1, page - 1))}
            aria-disabled={page <= 1}
            className={`text-sm ${page <= 1 ? "pointer-events-none text-muted/40" : "text-muted hover:underline"}`}
          >
            ‹ Anterior
          </Link>
          <span className="text-sm text-muted">
            Página {page} de {totalPages}
          </span>
          <Link
            href={buildUrl(Math.min(totalPages, page + 1))}
            aria-disabled={page >= totalPages}
            className={`text-sm ${page >= totalPages ? "pointer-events-none text-muted/40" : "text-muted hover:underline"}`}
          >
            Próxima ›
          </Link>
        </div>
      )}
    </div>
  );
}
