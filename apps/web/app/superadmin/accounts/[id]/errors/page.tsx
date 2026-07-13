import { requireRole } from "@/lib/auth/dal";
import { formatDuration } from "@/lib/format";
import { getRunChangesByRunId } from "@/lib/scraper-runs/get-run-changes";
import { ExpandableRow } from "@/app/(dashboard)/expandable-row";
import { PropertyChangeRow } from "@/app/(dashboard)/property-change-row";
import { Pagination } from "@/app/(dashboard)/pagination";
import { getAccountErrorRuns, ERROR_RUNS_PAGE_SIZE } from "../get-account-error-runs";
import { ClearErrorRunsButton } from "./clear-error-runs-button";

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Relatório de erros</h1>
          <p className="mt-1 text-sm text-muted">
            Execuções que falharam ou pararam cedo por erro — para diagnosticar um concorrente sem abrir o Supabase direto.
          </p>
        </div>
        {totalCount > 0 && <ClearErrorRunsButton accountId={id} />}
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
                          <span className="ml-2 rounded bg-erro/10 px-1.5 py-0.5 text-[10px] font-semibold text-erro-texto">FALHOU</span>
                        )}
                        {run.stoppedEarlyDueToError && (
                          <span className="ml-2 rounded bg-erro/10 px-1.5 py-0.5 text-[10px] font-semibold text-erro-texto">
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

      <Pagination page={page} totalPages={totalPages} buildUrl={buildUrl} />
    </div>
  );
}
