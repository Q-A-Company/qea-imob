import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { minimumSafeIntervalMinutes } from "scraper/core/polling-interval";
import { RegisterCompetitorForm } from "./register-form";
import { CompetitorsList } from "./competitors-list";

const INTERVAL_RECHECK_SAMPLE_SIZE = 3;

// Mesmo cálculo de maybeAdjustPollingInterval (packages/scraper/jobs/
// check-competitor.ts, que ajusta sozinho depois de cada checagem) — aqui
// só pra decidir quais opções do <select> ficam desabilitadas por
// concorrente (minimumSafeIntervalMinutes é a mesma função das duas
// pontas). Um concorrente sem nenhuma checagem limpa ainda (recém-
// cadastrado) cai no fallback do próprio minimumSafeIntervalMinutes(0) —
// menor degrau disponível, nada desabilitado.
async function getMinIntervalByCompetitorId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  competitorIds: string[]
): Promise<Map<string, number>> {
  if (competitorIds.length === 0) return new Map();

  const { data: runs } = await supabase
    .from("scraper_runs")
    .select("competitor_id, duration_ms, created_at")
    .in("competitor_id", competitorIds)
    .eq("run_type", "checagem")
    .eq("success", true)
    .eq("stopped_early_due_to_error", false)
    .not("duration_ms", "is", null)
    .order("created_at", { ascending: false });

  const durationsByCompetitor = new Map<string, number[]>();
  for (const run of runs ?? []) {
    const list = durationsByCompetitor.get(run.competitor_id) ?? [];
    if (list.length < INTERVAL_RECHECK_SAMPLE_SIZE) {
      list.push(run.duration_ms as number);
      durationsByCompetitor.set(run.competitor_id, list);
    }
  }

  const result = new Map<string, number>();
  for (const id of competitorIds) {
    const durations = durationsByCompetitor.get(id) ?? [];
    const avgDurationMs = durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0;
    result.set(id, minimumSafeIntervalMinutes(avgDurationMs).minutes);
  }
  return result;
}

// Cadastro mínimo (nome/abreviação/URL/intervalo) — sem aprendizado via IA
// nem preview, ver register-form.tsx. Onboarding completo continua um
// próximo passo natural.
export default async function CompetitorsPage() {
  const profile = await requireRole(["admin", "gerente"]);
  const supabase = await createClient();

  const { data: competitors, error } = await supabase
    .from("competitors")
    .select("id, name, abbreviation, listing_url, status, last_checked_at, polling_interval_minutes")
    .eq("account_id", profile.account_id ?? "")
    .order("name");

  if (error) {
    throw new Error(`Falha ao carregar concorrentes: ${error.message}`);
  }

  const minIntervalById = await getMinIntervalByCompetitorId(
    supabase,
    (competitors ?? []).map((c) => c.id)
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Concorrentes</h1>
        <p className="mt-1 text-sm text-muted">Cadastre e acompanhe os concorrentes monitorados pela sua conta.</p>
      </div>

      <RegisterCompetitorForm />

      <CompetitorsList
        competitors={(competitors ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          abbreviation: c.abbreviation,
          listingUrl: c.listing_url,
          status: c.status,
          lastCheckedAt: c.last_checked_at,
          pollingIntervalMinutes: c.polling_interval_minutes,
          minPollingIntervalMinutes: minIntervalById.get(c.id) ?? 5,
        }))}
      />
    </div>
  );
}
