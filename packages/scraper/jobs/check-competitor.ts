import { createServiceClient, type ScraperRunInsert } from "../core/db.js";
import { runPriceCheck } from "./run-price-check.js";
import { persistAndDetectChanges } from "./persist-and-compare.js";
import type { ExtractedProperty } from "../core/types.js";
import type { SupabaseClient } from "@supabase/supabase-js";

// Falhas de rede consecutivas (stopped_early_due_to_error) que pausam o
// concorrente automaticamente e notificam a conta — circuit breaker
// SEPARADO do gatilho de recalibração via IA (Etapa 7), que é sobre
// seletores obsoletos, não sobre não conseguir alcançar o site. Ver
// packages/scraper/README.md.
const CONSECUTIVE_FAILURE_THRESHOLD = 3;

export interface CheckCompetitorResult {
  competitorId: string;
  success: boolean;
  propertiesCaptured: number;
  changesDetected: number;
  stoppedEarlyDueToError: boolean;
  pausedByCircuitBreaker: boolean;
  reactivatedAfterSuccess: boolean;
  errorMessage: string | null;
  properties: ExtractedProperty[];
}

async function recordRun(supabase: SupabaseClient, run: ScraperRunInsert): Promise<void> {
  const { error } = await supabase.from("scraper_runs").insert(run);
  if (error) throw new Error(`Falha ao gravar scraper_runs: ${error.message}`);
}

async function countConsecutiveNetworkFailures(supabase: SupabaseClient, competitorId: string): Promise<number> {
  const { data } = await supabase
    .from("scraper_runs")
    .select("stopped_early_due_to_error")
    .eq("competitor_id", competitorId)
    .order("created_at", { ascending: false })
    .limit(10);

  let count = 0;
  for (const run of (data ?? []) as { stopped_early_due_to_error: boolean }[]) {
    if (run.stopped_early_due_to_error) count++;
    else break;
  }
  return count;
}

// Etapa 5: roda uma checagem de rotina (Etapa 4, sem IA) pra um concorrente,
// aplicando o contrato documentado em packages/scraper/README.md:
//   - scraper_runs.stopped_early_due_to_error fiel ao que run-price-check.ts
//     retornou (nunca "sucesso silencioso" quando parou cedo por erro).
//   - Falhas de rede consecutivas (não seletores obsoletos) pausam o
//     concorrente e notificam a conta — circuit breaker separado do
//     gatilho de recalibração via IA (que não existe ainda, Etapa 7).
//   - Persiste a captura em `properties` e compara com o que já estava
//     salvo (persist-and-compare.ts, Etapa 6) — gera `property_changes`
//     para preço/price_status alterado e para disponibilidade
//     (ativo ↔ possivelmente_vendido). A inferência de "sumiu da
//     listagem = possivelmente_vendido" só roda quando
//     stopped_early_due_to_error = false (ver contrato no README).
export async function checkCompetitor(competitorId: string): Promise<CheckCompetitorResult> {
  const supabase = createServiceClient();

  const { data: competitor, error: competitorError } = await supabase
    .from("competitors")
    .select("id, account_id, name, listing_url, polling_interval_minutes, status, last_checked_at")
    .eq("id", competitorId)
    .single();

  if (competitorError || !competitor) {
    throw new Error(`Concorrente ${competitorId} não encontrado: ${competitorError?.message ?? "sem dados"}`);
  }

  const { data: siteConfig } = await supabase
    .from("site_configs")
    .select("id, competitor_id, selectors, version, confidence_score, status, last_validated_at")
    .eq("competitor_id", competitorId)
    .eq("status", "ativo")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!siteConfig) {
    await recordRun(supabase, {
      competitor_id: competitorId,
      run_type: "checagem",
      success: false,
      properties_captured: 0,
      changes_detected: 0,
      error_message: "Nenhum site_config ativo para este concorrente",
      stopped_early_due_to_error: false,
    });
    return {
      competitorId,
      success: false,
      propertiesCaptured: 0,
      changesDetected: 0,
      stoppedEarlyDueToError: false,
      pausedByCircuitBreaker: false,
      reactivatedAfterSuccess: false,
      errorMessage: "Nenhum site_config ativo",
      properties: [],
    };
  }

  let result: Awaited<ReturnType<typeof runPriceCheck>> | null = null;
  let totalFailureMessage: string | null = null;
  try {
    result = await runPriceCheck({ listingUrl: competitor.listing_url, config: siteConfig.selectors });
  } catch (err) {
    totalFailureMessage = err instanceof Error ? err.message : String(err);
  }

  const propertiesCaptured = result?.properties.length ?? 0;
  // Falha total (nem chegou a rodar) conta como "não confiável" pelo mesmo
  // motivo que uma falha parcial conta: não sabemos se os imóveis ausentes
  // sumiram de verdade ou só não foram alcançados.
  const stoppedEarlyDueToError = result?.stoppedEarlyDueToError ?? true;
  const success = result !== null;

  // Só compara/persiste quando a extração de fato rodou (mesmo que parcial
  // — os imóveis que FORAM capturados continuam válidos pra comparação; só
  // a inferência por ausência fica bloqueada dentro de persistAndDetectChanges
  // quando stoppedEarlyDueToError). Falha total não tem o que persistir.
  const { changesDetected } = result
    ? await persistAndDetectChanges(supabase, competitorId, result.properties, { stoppedEarlyDueToError })
    : { changesDetected: 0 };

  let pausedByCircuitBreaker = false;
  let reactivatedAfterSuccess = false;

  if (stoppedEarlyDueToError) {
    const consecutiveFailures = await countConsecutiveNetworkFailures(supabase, competitorId);
    if (consecutiveFailures + 1 >= CONSECUTIVE_FAILURE_THRESHOLD) {
      await supabase.from("competitors").update({ status: "pausado" }).eq("id", competitorId);
      await supabase.from("notifications").insert({
        account_id: competitor.account_id,
        title: `Concorrente pausado: ${competitor.name}`,
        message: `"${competitor.name}" foi pausado automaticamente após ${consecutiveFailures + 1} falhas de rede consecutivas ao tentar checar preços. Verifique se o site está acessível e reative manualmente quando resolver.`,
      });
      pausedByCircuitBreaker = true;
    }
  } else if (success && competitor.status === "pausado") {
    // Recuperação automática: se alguém disparou "Verificar agora" num
    // concorrente pausado pelo circuit breaker e desta vez funcionou de
    // verdade (sem parar cedo por erro), reativa sozinho — só nesse caso
    // específico, nunca sobrescreve uma pausa feita manualmente por outro
    // motivo que não seja falha de rede.
    await supabase.from("competitors").update({ status: "ativo" }).eq("id", competitorId);
    reactivatedAfterSuccess = true;
  }

  await recordRun(supabase, {
    competitor_id: competitorId,
    run_type: "checagem",
    success,
    properties_captured: propertiesCaptured,
    changes_detected: changesDetected,
    error_message: totalFailureMessage,
    stopped_early_due_to_error: stoppedEarlyDueToError,
  });

  await supabase.from("competitors").update({ last_checked_at: new Date().toISOString() }).eq("id", competitorId);

  return {
    competitorId,
    success,
    propertiesCaptured,
    changesDetected,
    stoppedEarlyDueToError,
    pausedByCircuitBreaker,
    reactivatedAfterSuccess,
    errorMessage: totalFailureMessage,
    properties: result?.properties ?? [],
  };
}
