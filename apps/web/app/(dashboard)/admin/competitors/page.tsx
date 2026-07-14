import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { minimumSafeIntervalMinutes, medianDurationMs } from "scraper/core/polling-interval";
import { RegisterCompetitorForm } from "./register-form";
import { CompetitorsList } from "./competitors-list";

const INTERVAL_RECHECK_SAMPLE_SIZE = 3;

// Mesma fonte de dado e mesma função de packages/scraper/jobs/
// check-competitor.ts (maybeAdjustPollingInterval) — confirmado
// empiricamente contra o banco real que as duas queries produzem
// exatamente as mesmas 3 execuções e a mesma mediana (investigação do
// caso Podium/Muller). Mediana, não média (mesmo motivo do ajuste
// automático: um outlier isolado não deveria dominar o piso exibido).
// Multiplicador padrão (SAFETY_MULTIPLIER, sem a histerese de descida do
// ajuste automático) — este é o piso de segurança pra escolha MANUAL no
// seletor, não o gatilho do ajuste automático; não faz sentido ficar mais
// permissivo aqui só porque o automático tem uma banda morta pra evitar
// oscilação. Um concorrente sem nenhuma checagem limpa ainda (recém-
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
    result.set(id, minimumSafeIntervalMinutes(medianDurationMs(durations)).minutes);
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

  const competitorIds = (competitors ?? []).map((c) => c.id);

  // Cadastro novo cuja única config está pendente_revisao (aguardando o
  // Admin confirmar, enviar ao SuperAdmin, ou o SuperAdmin decidir) não pode
  // aparecer como "cadastrado" na lista principal — pedido do usuário,
  // depois de perceber que a tela mostrava "Ativo" pra um concorrente que na
  // prática ainda não roda checagem nenhuma. Diferente de uma recalibração
  // pendente (version > 1) de um concorrente que JÁ tem um site_config
  // ativo — esse continua aparecendo normalmente, com histórico real rodando.
  const { data: siteConfigs, error: siteConfigsError } = await supabase
    .from("site_configs")
    .select("competitor_id, version, status")
    .in("competitor_id", competitorIds);
  if (siteConfigsError) throw new Error(`Falha ao carregar configurações de site: ${siteConfigsError.message}`);

  const hasActiveConfig = new Set<string>();
  const hasPendingFreshConfig = new Set<string>();
  for (const sc of siteConfigs ?? []) {
    if (sc.status === "ativo") hasActiveConfig.add(sc.competitor_id);
    if (sc.version === 1 && sc.status === "pendente_revisao") hasPendingFreshConfig.add(sc.competitor_id);
  }
  const awaitingApprovalIds = new Set(
    (competitors ?? []).filter((c) => hasPendingFreshConfig.has(c.id) && !hasActiveConfig.has(c.id)).map((c) => c.id)
  );

  const visibleCompetitors = (competitors ?? []).filter((c) => !awaitingApprovalIds.has(c.id));

  const minIntervalById = await getMinIntervalByCompetitorId(
    supabase,
    visibleCompetitors.map((c) => c.id)
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Concorrentes</h1>
        <p className="mt-1 text-sm text-muted">Cadastre e acompanhe os concorrentes monitorados pela sua conta.</p>
      </div>

      <RegisterCompetitorForm />

      {awaitingApprovalIds.size > 0 && (
        <p className="text-xs text-muted" role="status">
          {awaitingApprovalIds.size === 1
            ? "1 cadastro aguardando aprovação de um SuperAdmin não aparece na lista abaixo até a revisão."
            : `${awaitingApprovalIds.size} cadastros aguardando aprovação de um SuperAdmin não aparecem na lista abaixo até a revisão.`}
        </p>
      )}

      <CompetitorsList
        competitors={visibleCompetitors.map((c) => ({
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
