import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDuration } from "@/lib/format";
import { getRunChangesByRunId } from "@/lib/scraper-runs/get-run-changes";
import { ExpandableRow } from "../../expandable-row";
import { PropertyChangeRow } from "../../property-change-row";

const RUN_TYPE_LABEL: Record<string, string> = {
  checagem: "Checagem",
  recalibracao: "Recalibração",
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR");
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR");
}

export const HISTORY_PAGE_SIZE = 30;

interface StatusInfo {
  label: string;
  className: string;
}

function statusInfo(run: { success: boolean; stoppedEarlyDueToError: boolean }): StatusInfo {
  if (!run.success) {
    return { label: "Falhou", className: "border-erro/30 bg-erro/10 text-erro-texto" };
  }
  if (run.stoppedEarlyDueToError) {
    return {
      label: "Parcial",
      className: "border-erro/30 bg-erro/10 text-erro-texto",
    };
  }
  return {
    label: "Sucesso",
    className: "border-sucesso/30 bg-sucesso/10 text-sucesso-texto",
  };
}

// Compartilhado entre /admin/history e /user/history (Etapa 11). Redesign:
// paginação real (era um .limit(30) sem paginação) + linha expansível
// mostrando exatamente quais property_changes cada execução gerou (migration
// 0016, scraper_run_id) — antes só dava pra ver a CONTAGEM de mudanças, não
// quais.
export async function HistoryContent({
  accountId,
  page,
  basePath,
  subtitle = "Execuções de checagem e recalibração dos concorrentes da sua conta.",
}: {
  accountId: string;
  page: number;
  basePath: string;
  subtitle?: string;
}) {
  const supabase = await createClient();

  const { data: competitors, error: competitorsError } = await supabase
    .from("competitors")
    .select("id, name")
    .eq("account_id", accountId);
  if (competitorsError) throw new Error(`Falha ao buscar concorrentes: ${competitorsError.message}`);

  const competitorIds = (competitors ?? []).map((c) => c.id);
  const competitorNameById = new Map((competitors ?? []).map((c) => [c.id, c.name]));

  const offset = (page - 1) * HISTORY_PAGE_SIZE;
  const {
    data: runs,
    error,
    count,
  } = competitorIds.length
    ? await supabase
        .from("scraper_runs")
        .select(
          "id, competitor_id, run_type, success, properties_captured, changes_detected, stopped_early_due_to_error, error_message, duration_ms, created_at",
          { count: "exact" }
        )
        .in("competitor_id", competitorIds)
        .order("created_at", { ascending: false })
        .range(offset, offset + HISTORY_PAGE_SIZE - 1)
    : { data: [], error: null, count: 0 };
  if (error) throw new Error(`Falha ao buscar histórico: ${error.message}`);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / HISTORY_PAGE_SIZE));
  const changesByRunId = await getRunChangesByRunId((runs ?? []).map((r) => r.id));

  function buildUrl(p: number): string {
    return `${basePath}?page=${p}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Histórico</h1>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
      </div>

      {(!runs || runs.length === 0) && <p className="text-sm text-muted">Nenhuma execução registrada ainda.</p>}

      {runs && runs.length > 0 && (
        <ul className="divide-y divide-surface-border rounded-lg border border-surface-border bg-surface">
          {runs.map((run) => {
            const status = statusInfo({ success: run.success, stoppedEarlyDueToError: run.stopped_early_due_to_error });
            const changes = changesByRunId.get(run.id) ?? [];
            return (
              <ExpandableRow
                key={run.id}
                summary={
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {competitorNameById.get(run.competitor_id) ?? "Concorrente removido"}
                        <span className="ml-2 text-xs font-normal text-muted">{RUN_TYPE_LABEL[run.run_type] ?? run.run_type}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {run.properties_captured} {run.properties_captured === 1 ? "imóvel analisado" : "imóveis analisados"} ·{" "}
                        {run.changes_detected} {run.changes_detected === 1 ? "mudança" : "mudanças"}
                        {!run.success && run.error_message ? ` · ${run.error_message}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${status.className}`}>{status.label}</span>
                      <span>{formatDuration(run.duration_ms)}</span>
                      <span className="text-right">
                        {formatDate(run.created_at)}
                        <br />
                        {formatTime(run.created_at)}
                      </span>
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
