import { createClient } from "@/lib/supabase/server";

const RUN_TYPE_LABEL: Record<string, string> = {
  checagem: "Checagem",
  recalibracao: "Recalibração",
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}

// Compartilhado entre /admin/history e /user/history (Etapa 11) — tela
// inteiramente de leitura, nenhum controle de gestão aqui, então não tem
// diferença de comportamento entre os dois roles.
export async function HistoryContent({ accountId }: { accountId: string }) {
  const supabase = await createClient();

  const { data: competitors } = await supabase.from("competitors").select("id, name").eq("account_id", accountId);

  const competitorIds = (competitors ?? []).map((c) => c.id);
  const competitorNameById = new Map((competitors ?? []).map((c) => [c.id, c.name]));

  const { data: runs, error } = await supabase
    .from("scraper_runs")
    .select("id, competitor_id, run_type, success, properties_captured, changes_detected, stopped_early_due_to_error, error_message, created_at")
    .in("competitor_id", competitorIds.length > 0 ? competitorIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw new Error(`Falha ao carregar histórico: ${error.message}`);

  return (
    <div>
      <h1 className="text-lg font-semibold text-foreground">Histórico</h1>
      <p className="mt-1 text-sm text-muted">Últimas 30 execuções de checagem/recalibração dos seus concorrentes.</p>

      {(!runs || runs.length === 0) && <p className="mt-6 text-sm text-muted">Nenhuma execução registrada ainda.</p>}

      {runs && runs.length > 0 && (
        <ul className="mt-6 divide-y divide-surface-border rounded-md border border-surface-border bg-surface">
          {runs.map((run) => (
            <li key={run.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {competitorNameById.get(run.competitor_id) ?? "Concorrente removido"}
                  <span className="ml-2 text-xs text-muted">{RUN_TYPE_LABEL[run.run_type] ?? run.run_type}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {run.success ? `${run.properties_captured} imóveis · ${run.changes_detected} mudança(s)` : `Falhou${run.error_message ? `: ${run.error_message}` : ""}`}
                  {run.stopped_early_due_to_error ? " · parou cedo por erro" : ""}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted">{formatDateTime(run.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
