import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface AccountErrorRun {
  id: string;
  competitorId: string;
  competitorName: string;
  runType: string;
  success: boolean;
  stoppedEarlyDueToError: boolean;
  propertiesCaptured: number;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface AccountErrorRunsResult {
  runs: AccountErrorRun[];
  totalCount: number;
}

export const ERROR_RUNS_PAGE_SIZE = 30;

// Paginação real (.range() + count) desde o início — não .slice() em JS
// como get-report-data.ts fazia antes de virar Set-based, e não um
// .limit(50) sem paginação como a antiga get-account-detail-data.ts fazia.
// scraper_runs cresce sem limite com o tempo (uma linha por checagem), ao
// contrário de property_changes (que fica na casa de centenas por conta) —
// lição direta do bug de truncagem em ~1000 linhas investigado nesta mesma
// sessão (ver packages/scraper/README.md).
export async function getAccountErrorRuns(accountId: string, page: number): Promise<AccountErrorRunsResult> {
  const supabase = await createClient();

  const { data: competitors, error: competitorsError } = await supabase
    .from("competitors")
    .select("id, name")
    .eq("account_id", accountId);
  if (competitorsError) throw new Error(`Falha ao buscar concorrentes: ${competitorsError.message}`);

  const competitorIds = (competitors ?? []).map((c) => c.id);
  const competitorNameById = new Map((competitors ?? []).map((c) => [c.id, c.name]));
  if (competitorIds.length === 0) return { runs: [], totalCount: 0 };

  const offset = (page - 1) * ERROR_RUNS_PAGE_SIZE;

  const { data, error, count } = await supabase
    .from("scraper_runs")
    .select(
      "id, competitor_id, run_type, success, properties_captured, error_message, stopped_early_due_to_error, duration_ms, created_at",
      { count: "exact" }
    )
    .in("competitor_id", competitorIds)
    .or("success.eq.false,stopped_early_due_to_error.eq.true")
    .order("created_at", { ascending: false })
    .range(offset, offset + ERROR_RUNS_PAGE_SIZE - 1);
  if (error) throw new Error(`Falha ao buscar execuções com erro: ${error.message}`);

  return {
    runs: (data ?? []).map((r) => ({
      id: r.id,
      competitorId: r.competitor_id,
      competitorName: competitorNameById.get(r.competitor_id) ?? "Concorrente removido",
      runType: r.run_type,
      success: r.success,
      stoppedEarlyDueToError: r.stopped_early_due_to_error,
      propertiesCaptured: r.properties_captured,
      errorMessage: r.error_message,
      durationMs: r.duration_ms,
      createdAt: r.created_at,
    })),
    totalCount: count ?? 0,
  };
}

// Badge "erro novo" da nav (account-sidebar.tsx) — some quando o SuperAdmin
// visita a aba de erros (errors/page.tsx grava viewed_at nesse momento), sem
// precisar "limpar" nada explicitamente (pedido do usuário: por usuário+
// conta, não um simples count>0 global). Sem linha em
// superadmin_error_report_views ainda (nunca visitou) = qualquer erro já
// acende o aviso.
export async function getHasNewErrorsForAccount(userId: string, accountId: string): Promise<boolean> {
  const supabase = await createClient();

  const { data: competitors, error: competitorsError } = await supabase.from("competitors").select("id").eq("account_id", accountId);
  if (competitorsError) throw new Error(`Falha ao buscar concorrentes: ${competitorsError.message}`);
  const competitorIds = (competitors ?? []).map((c) => c.id);
  if (competitorIds.length === 0) return false;

  const { data: viewRow, error: viewError } = await supabase
    .from("superadmin_error_report_views")
    .select("viewed_at")
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (viewError) throw new Error(`Falha ao buscar última visita ao relatório de erros: ${viewError.message}`);

  let query = supabase
    .from("scraper_runs")
    .select("id", { count: "exact", head: true })
    .in("competitor_id", competitorIds)
    .or("success.eq.false,stopped_early_due_to_error.eq.true");
  if (viewRow) {
    query = query.gt("created_at", viewRow.viewed_at);
  }
  const { count, error } = await query;
  if (error) throw new Error(`Falha ao checar erros novos: ${error.message}`);
  return (count ?? 0) > 0;
}
