import { createServiceClient, type ScraperRunInsert } from "../core/db.js";
import { runPriceCheck } from "./run-price-check.js";
import { persistAndDetectChanges, type DetectedChange } from "./persist-and-compare.js";
import { createNotification } from "../core/notify.js";
import type { ExtractedProperty } from "../core/types.js";
import type { SupabaseClient } from "@supabase/supabase-js";

function formatBRL(value: number | null): string {
  if (value === null) return "sob consulta";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Etapa 8: uma notificação (sino) por property_change — property_change_id
// preenchido, pra quem clicar na notificação conseguir chegar no imóvel
// específico depois (Etapa 11). Título/mensagem variam pelo tipo de mudança
// (preço vs. disponibilidade); os dois nunca preenchidos ao mesmo tempo numa
// mesma linha (ver persist-and-compare.ts).
async function notifyPropertyChanges(
  supabase: SupabaseClient,
  accountId: string,
  competitorName: string,
  changes: DetectedChange[]
): Promise<void> {
  for (const change of changes) {
    if (change.changeType === "added") {
      await createNotification(supabase, {
        accountId,
        propertyChangeId: change.propertyChangeId,
        title: `Novo imóvel: ${competitorName}`,
        message: `O imóvel ${change.externalId} apareceu na listagem de "${competitorName}" por ${formatBRL(change.newPrice)}.`,
      });
    } else if (change.changeType === "removed") {
      await createNotification(supabase, {
        accountId,
        propertyChangeId: change.propertyChangeId,
        title: `Imóvel possivelmente vendido: ${competitorName}`,
        message: `O imóvel ${change.externalId} não aparece mais na listagem de "${competitorName}" — pode ter sido vendido ou removido.`,
      });
    } else if (change.changeType === "reappeared") {
      await createNotification(supabase, {
        accountId,
        propertyChangeId: change.propertyChangeId,
        title: `Imóvel voltou a aparecer: ${competitorName}`,
        message: `O imóvel ${change.externalId} reapareceu na listagem de "${competitorName}".`,
      });
    } else {
      await createNotification(supabase, {
        accountId,
        propertyChangeId: change.propertyChangeId,
        title: `Mudança de preço: ${competitorName}`,
        message: `O imóvel ${change.externalId} de "${competitorName}" mudou de ${formatBRL(change.oldPrice)} para ${formatBRL(change.newPrice)}.`,
      });
    }
  }
}

// Falhas de rede consecutivas (stopped_early_due_to_error) que pausam o
// concorrente automaticamente e notificam a conta — circuit breaker
// SEPARADO do gatilho de recalibração via IA (Etapa 7), que é sobre
// seletores obsoletos, não sobre não conseguir alcançar o site. Ver
// packages/scraper/README.md.
const CONSECUTIVE_FAILURE_THRESHOLD = 3;

// Gatilho de recalibração (Etapa 7): extração COMPLETA (não é falha de
// rede) mas de qualidade ruim o suficiente para sugerir seletor obsoleto —
// 0 imóveis capturados, ou a maioria sem preço.
const DEGRADED_MIN_MISSING_PRICE_RATIO = 0.5;

export interface ChangesByType {
  price: number;
  added: number;
  removed: number;
  reappeared: number;
}

export interface CheckCompetitorResult {
  competitorId: string;
  success: boolean;
  propertiesCaptured: number;
  changesDetected: number;
  changesByType: ChangesByType;
  stoppedEarlyDueToError: boolean;
  pausedByCircuitBreaker: boolean;
  reactivatedAfterSuccess: boolean;
  configMarkedDegraded: boolean;
  errorMessage: string | null;
  properties: ExtractedProperty[];
}

const EMPTY_CHANGES_BY_TYPE: ChangesByType = { price: 0, added: 0, removed: 0, reappeared: 0 };

function countChangesByType(changes: DetectedChange[]): ChangesByType {
  const counts = { ...EMPTY_CHANGES_BY_TYPE };
  for (const change of changes) counts[change.changeType]++;
  return counts;
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
//   - Extração completa mas de qualidade ruim (0 imóveis, ou maioria sem
//     preço) marca o site_config como 'degradado' e notifica a conta —
//     gatilho de recalibração via IA (recalibrate-site-config.ts, Etapa 7),
//     desacoplado do circuit breaker de falha de rede acima.
//   - Toda notificação (pausa, degradação, mudança de preço/disponibilidade)
//     passa por core/notify.ts (Etapa 8), que respeita
//     notification_settings.site_enabled da conta — não insere mais direto.
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
      changesByType: EMPTY_CHANGES_BY_TYPE,
      stoppedEarlyDueToError: false,
      pausedByCircuitBreaker: false,
      reactivatedAfterSuccess: false,
      configMarkedDegraded: false,
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

  // Extração completou (não foi falha de rede) mas veio vazia ou majoritariamente
  // sem preço — sinal de seletor obsoleto, não de catálogo esvaziado. Distinto
  // de stoppedEarlyDueToError (que é sobre não CONSEGUIR extrair), mas tem o
  // mesmo efeito prático sobre a confiabilidade dos dados desta execução.
  const configLooksDegraded =
    success &&
    !stoppedEarlyDueToError &&
    (propertiesCaptured === 0 || result!.cardsWithoutPrice / propertiesCaptured >= DEGRADED_MIN_MISSING_PRICE_RATIO);

  // Só compara/persiste quando a extração de fato rodou (mesmo que parcial
  // — os imóveis que FORAM capturados continuam válidos pra comparação).
  // stoppedEarlyDueToError e configLooksDegraded viajam SEPARADOS agora
  // (antes eram um só booleano pré-combinado) — dentro de
  // persistAndDetectChanges, "removido" (inferência por ausência) continua
  // bloqueado pelos dois motivos, mas "adicionado" (inferência por
  // presença) só é bloqueado por configLooksDegraded: falha de rede não
  // torna o que FOI capturado menos confiável, mas dado suspeito (seletor
  // possivelmente quebrado) sim.
  const { changesDetected, changes } = result
    ? await persistAndDetectChanges(supabase, competitorId, result.properties, {
        stoppedEarlyDueToError,
        configLooksDegraded,
      })
    : { changesDetected: 0, changes: [] };

  if (changes.length > 0) {
    await notifyPropertyChanges(supabase, competitor.account_id, competitor.name, changes);
  }

  if (configLooksDegraded) {
    await supabase.from("site_configs").update({ status: "degradado" }).eq("id", siteConfig.id);
    await createNotification(supabase, {
      accountId: competitor.account_id,
      title: `Concorrente com seletores desatualizados: ${competitor.name}`,
      message: `"${competitor.name}" capturou ${propertiesCaptured} imóveis${
        propertiesCaptured > 0 ? ` (${result!.cardsWithoutPrice} sem preço)` : ""
      } nesta checagem — provável mudança no site. O config foi marcado como degradado; a recalibração automática via IA vai rodar na próxima varredura (Etapa 7).`,
    });
  }

  let pausedByCircuitBreaker = false;
  let reactivatedAfterSuccess = false;

  if (stoppedEarlyDueToError) {
    const consecutiveFailures = await countConsecutiveNetworkFailures(supabase, competitorId);
    if (consecutiveFailures + 1 >= CONSECUTIVE_FAILURE_THRESHOLD) {
      await supabase.from("competitors").update({ status: "pausado" }).eq("id", competitorId);
      await createNotification(supabase, {
        accountId: competitor.account_id,
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
    changesByType: countChangesByType(changes),
    stoppedEarlyDueToError,
    pausedByCircuitBreaker,
    reactivatedAfterSuccess,
    configMarkedDegraded: configLooksDegraded,
    errorMessage: totalFailureMessage,
    properties: result?.properties ?? [],
  };
}
