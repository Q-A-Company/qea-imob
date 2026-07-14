import { randomUUID } from "node:crypto";
import { createServiceClient, type ScraperRunInsert } from "../core/db.js";
import { runPriceCheck } from "./run-price-check.js";
import { persistAndDetectChanges, type DetectedChange } from "./persist-and-compare.js";
import { createNotification } from "../core/notify.js";
import { minimumSafeIntervalMinutes, medianDurationMs, SAFETY_MULTIPLIER, DECREASE_SAFETY_MULTIPLIER } from "../core/polling-interval.js";
import type { ExtractedProperty } from "../core/types.js";
import type { SupabaseClient } from "@supabase/supabase-js";

function formatBRL(value: number | null): string {
  if (value === null) return "sob consulta";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Notificação é texto puro (não HTML/link, diferente das 3 telas que
// mostram reference_code como link clicável) — "Um imóvel" no lugar de
// "O imóvel " quando não há código visível, pra continuar lendo natural
// nas 4 mensagens abaixo ("Um imóvel apareceu...", não "O imóvel  apareceu...").
function describeProperty(referenceCode: string | null): string {
  return referenceCode ? `O imóvel ${referenceCode}` : "Um imóvel";
}

// Etapa 8: uma notificação (sino) por property_change — property_change_id
// preenchido, pra quem clicar na notificação conseguir chegar no imóvel
// específico depois (Etapa 11). Título/mensagem variam pelo tipo de mudança
// (preço vs. disponibilidade); os dois nunca preenchidos ao mesmo tempo numa
// mesma linha (ver persist-and-compare.ts).
async function notifyPropertyChanges(
  supabase: SupabaseClient,
  accountId: string,
  competitorId: string,
  competitorName: string,
  changes: DetectedChange[]
): Promise<void> {
  for (const change of changes) {
    if (change.changeType === "added") {
      await createNotification(supabase, {
        accountId,
        competitorId,
        propertyChangeId: change.propertyChangeId,
        title: `Novo imóvel: ${competitorName}`,
        message: `${describeProperty(change.referenceCode)} apareceu na listagem de "${competitorName}" por ${formatBRL(change.newPrice)}.`,
      });
    } else if (change.changeType === "removed") {
      await createNotification(supabase, {
        accountId,
        competitorId,
        propertyChangeId: change.propertyChangeId,
        title: `Imóvel possivelmente vendido: ${competitorName}`,
        message: `${describeProperty(change.referenceCode)} não aparece mais na listagem de "${competitorName}" — pode ter sido vendido ou removido.`,
      });
    } else if (change.changeType === "reappeared") {
      await createNotification(supabase, {
        accountId,
        competitorId,
        propertyChangeId: change.propertyChangeId,
        title: `Imóvel voltou a aparecer: ${competitorName}`,
        message: `${describeProperty(change.referenceCode)} reapareceu na listagem de "${competitorName}".`,
      });
    } else {
      await createNotification(supabase, {
        accountId,
        competitorId,
        propertyChangeId: change.propertyChangeId,
        title: `Mudança de preço: ${competitorName}`,
        message: `${describeProperty(change.referenceCode)} de "${competitorName}" mudou de ${formatBRL(change.oldPrice)} para ${formatBRL(change.newPrice)}.`,
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

// Terceiro gatilho de degradação, só pra json_api (totalDeclared é sempre
// null em html_css, condição fica inerte pra esse caso): capturado muito
// abaixo do que a própria API declara. Achado real: um config json_api
// pode ter um limite fixo (ex: linesPerPage) que cobre o catálogo de hoje
// mas silenciosamente passa a capturar só uma fração se o catálogo crescer
// — sem essa checagem, isso completaria "com sucesso" (todos os itens
// capturados têm preço válido, então DEGRADED_MIN_MISSING_PRICE_RATIO
// nunca dispara) e nunca geraria alerta nenhum. Constante própria (não
// reaproveita DEGRADED_MIN_MISSING_PRICE_RATIO) — são decisões diferentes,
// podem precisar de ajuste independente.
const DEGRADED_MIN_COVERAGE_RATIO = 0.5;

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
  // true quando esta chamada nem chegou a rodar — outra checagem do MESMO
  // concorrente já estava em andamento (lock ocupado). Não gera
  // scraper_runs (nada rodou de verdade), só avisa quem chamou.
  skippedAlreadyRunning: boolean;
}

// Checagem de um MESMO concorrente nunca pode rodar em paralelo consigo
// mesma — o scheduler (apps/worker) já não sobrepõe consigo mesmo (loop
// via setTimeout recursivo, só começa o próximo ciclo depois que o
// anterior termina de verdade), mas "Verificar agora" (Server Action,
// checkCompetitorNowAction) chama checkCompetitor() direto, fora desse
// loop — um clique no exato momento em que o scheduler já está checando
// o mesmo concorrente rodaria as duas chamadas concorrentemente, sem essa
// trava. Investigado e confirmado com o usuário antes de implementar.
//
// STALE_LOCK_MINUTES: se o processo morrer NO MEIO de uma checagem (não
// um erro tratado, um crash de verdade), check_started_at ficaria preso
// pra sempre sem isso — 30min dá folga confortável até pro maior
// concorrente hoje (Sentineli, ~4min) sem arriscar destravar um lock que
// ainda está genuinamente em uso.
const STALE_LOCK_MINUTES = 30;

// UPDATE condicional atômico — não é "buscar o valor, decidir, escrever"
// (teria uma corrida entre os dois passos); é um único UPDATE ... WHERE
// que só afeta a linha se ela ainda estiver livre (ou o lock anterior
// estiver velho demais pra ser confiável), e o retorno (afetou linha ou
// não) já É a resposta de quem ganhou o lock — sem select() coordenado
// com update() em dois passos.
async function acquireCheckLock(supabase: SupabaseClient, competitorId: string): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const staleThresholdIso = new Date(Date.now() - STALE_LOCK_MINUTES * 60_000).toISOString();
  const { data, error } = await supabase
    .from("competitors")
    .update({ check_started_at: nowIso })
    .eq("id", competitorId)
    .or(`check_started_at.is.null,check_started_at.lt.${staleThresholdIso}`)
    .select("id");
  if (error) throw new Error(`Falha ao adquirir lock de checagem: ${error.message}`);
  return (data ?? []).length > 0;
}

async function releaseCheckLock(supabase: SupabaseClient, competitorId: string): Promise<void> {
  await supabase.from("competitors").update({ check_started_at: null }).eq("id", competitorId);
}

const EMPTY_CHANGES_BY_TYPE: ChangesByType = { price: 0, added: 0, removed: 0, reappeared: 0 };

const SKIPPED_RESULT_BASE = {
  success: false,
  propertiesCaptured: 0,
  changesDetected: 0,
  changesByType: EMPTY_CHANGES_BY_TYPE,
  stoppedEarlyDueToError: false,
  pausedByCircuitBreaker: false,
  reactivatedAfterSuccess: false,
  configMarkedDegraded: false,
  properties: [] as ExtractedProperty[],
  skippedAlreadyRunning: true,
} as const;

function countChangesByType(changes: DetectedChange[]): ChangesByType {
  const counts = { ...EMPTY_CHANGES_BY_TYPE };
  for (const change of changes) counts[change.changeType]++;
  return counts;
}

async function recordRun(supabase: SupabaseClient, run: ScraperRunInsert): Promise<void> {
  const { error } = await supabase.from("scraper_runs").insert(run);
  if (error) throw new Error(`Falha ao gravar scraper_runs: ${error.message}`);
}

// Completa uma linha de scraper_runs já inserida (ver comentário grande em
// checkCompetitor sobre por que a linha precisa existir ANTES de
// persistAndDetectChanges rodar) com os dois campos que só são conhecidos
// depois: changes_detected (resultado de persistAndDetectChanges) e
// duration_ms final (só fecha quando a execução inteira termina, não só a
// extração).
async function finalizeRun(supabase: SupabaseClient, runId: string, changesDetected: number, durationMs: number): Promise<void> {
  const { error } = await supabase
    .from("scraper_runs")
    .update({ changes_detected: changesDetected, duration_ms: durationMs })
    .eq("id", runId);
  if (error) throw new Error(`Falha ao atualizar scraper_runs: ${error.message}`);
}

// excludeRunId: desde que a migration 0016 passou a exigir a linha de
// scraper_runs gravada ANTES de persistAndDetectChanges (ver comentário
// grande em checkCompetitor), a execução ATUAL já existe nesta tabela na
// hora em que essa contagem roda — sem excluí-la, ela entraria na query E
// no "+ 1" manual do chamador, contando em dobro.
async function countConsecutiveNetworkFailures(supabase: SupabaseClient, competitorId: string, excludeRunId: string): Promise<number> {
  const { data } = await supabase
    .from("scraper_runs")
    .select("stopped_early_due_to_error")
    .eq("competitor_id", competitorId)
    .neq("id", excludeRunId)
    .order("created_at", { ascending: false })
    .limit(10);

  let count = 0;
  for (const run of (data ?? []) as { stopped_early_due_to_error: boolean }[]) {
    if (run.stopped_early_due_to_error) count++;
    else break;
  }
  return count;
}

// Mediana das últimas execuções — não a mais recente sozinha, nem a média
// (troca feita junto com o ajuste virar bidirecional: a média deixa UMA
// execução lenta isolada puxar o intervalo, a mediana ignora esse tipo de
// outlier tanto pra cima quanto pra baixo). Com 1 execução disponível
// (primeira checagem real do concorrente), a mediana já é essa 1 execução
// — não precisa de caso especial pra "é a primeira vez".
const INTERVAL_RECHECK_SAMPLE_SIZE = 3;

// Reavalia polling_interval_minutes contra a duração medida — agora
// BIDIRECIONAL (sobe E desce sozinho), decisão revista: a regra antiga
// ("só sobe, nunca desce") existia porque um intervalo curto demais
// arriscava duas checagens do mesmo concorrente se sobrepondo. Esse risco
// não existe mais — o lock de check_started_at (Etapa do intervalo
// adaptativo, Item 0) já impede sobreposição incondicionalmente; um
// intervalo temporariamente curto demais no pior caso só faz a próxima
// tentativa esperar a anterior liberar, não corrompe nada.
//
// Histerese pra não oscilar num concorrente na fronteira de um degrau:
// sobe com SAFETY_MULTIPLIER (2x — reage rápido, segurança primeiro), só
// desce quando a folga real já é maior (DECREASE_SAFETY_MULTIPLIER, 3x —
// não só o mínimo). Os dois cálculos nunca conflitam entre si: como o
// multiplicador de descida é maior, o degrau recomendado pra descida
// nunca fica ABAIXO do degrau recomendado pra subida (função monótona no
// multiplicador) — não existe cenário em que as duas condições abaixo
// disparariam ao mesmo tempo.
//
// Chamada depois de TODA checagem bem-sucedida e limpa (ver call site em
// checkCompetitor) — é a MESMA lógica pra "primeira checagem" e pra
// "concorrente mudou de velocidade com o tempo", não mecanismos
// separados. Melhor esforço: qualquer erro aqui é logado, nunca derruba a
// checagem que já rodou com sucesso.
async function maybeAdjustPollingInterval(
  supabase: SupabaseClient,
  competitor: { id: string; account_id: string; name: string; polling_interval_minutes: number }
): Promise<void> {
  const { data: recentRuns, error: recentRunsError } = await supabase
    .from("scraper_runs")
    .select("duration_ms")
    .eq("competitor_id", competitor.id)
    .eq("run_type", "checagem")
    .eq("success", true)
    .eq("stopped_early_due_to_error", false)
    .not("duration_ms", "is", null)
    .order("created_at", { ascending: false })
    .limit(INTERVAL_RECHECK_SAMPLE_SIZE);
  if (recentRunsError) {
    console.error(`Falha ao buscar execuções recentes pra reavaliar intervalo (${competitor.id}): ${recentRunsError.message}`);
    return;
  }

  const durations = (recentRuns ?? []).map((r) => r.duration_ms as number);
  if (durations.length === 0) return;
  const medianMs = medianDurationMs(durations);

  const increaseRecommendation = minimumSafeIntervalMinutes(medianMs, SAFETY_MULTIPLIER);
  const decreaseRecommendation = minimumSafeIntervalMinutes(medianMs, DECREASE_SAFETY_MULTIPLIER);

  const oldMinutes = competitor.polling_interval_minutes;
  let recommended: typeof increaseRecommendation;
  if (increaseRecommendation.minutes > oldMinutes) {
    recommended = increaseRecommendation;
  } else if (decreaseRecommendation.minutes < oldMinutes) {
    recommended = decreaseRecommendation;
  } else {
    return; // dentro da banda morta da histerese — não mexe
  }

  const { error: updateError } = await supabase
    .from("competitors")
    .update({ polling_interval_minutes: recommended.minutes })
    .eq("id", competitor.id);
  if (updateError) {
    console.error(`Falha ao ajustar polling_interval_minutes automaticamente (${competitor.id}): ${updateError.message}`);
    return;
  }

  const medianMinutesLabel = (medianMs / 60_000).toFixed(1);
  const isIncrease = recommended.minutes > oldMinutes;
  const marginNote =
    isIncrease && !recommended.marginGuaranteed
      ? " Mesmo no maior intervalo disponível, a margem de segurança não está garantida — vale investigar por que este concorrente está tão lento."
      : "";

  // audit_log inserido direto (não via lib/audit/log.ts) — packages/scraper
  // não importa de apps/web (sentido contrário ao resto do projeto), então
  // não reaproveita aquele helper; mesmo formato de linha, mesmo
  // best-effort (nunca lança, só loga). Grava nos dois sentidos — histórico
  // completo, mesmo quando a notificação abaixo não dispara.
  const { error: auditError } = await supabase.from("audit_log").insert({
    actor_user_id: null,
    account_id: competitor.account_id,
    action_type: "competitor_interval_changed",
    target_type: "competitor",
    target_id: competitor.id,
    details: {
      automatic: true,
      direction: isIncrease ? "up" : "down",
      oldMinutes,
      newMinutes: recommended.minutes,
      medianDurationMs: Math.round(medianMs),
      name: competitor.name,
    },
  });
  if (auditError) console.error(`Falha ao gravar audit_log (competitor_interval_changed automático): ${auditError.message}`);

  // Notifica nos dois sentidos (decisão confirmada com o usuário) — subida
  // e descida são igualmente dignas de nota pro Admin, mesmo a descida
  // sendo "boa notícia" (monitoramento ficou mais frequente sozinho).
  await createNotification(supabase, {
    accountId: competitor.account_id,
    competitorId: competitor.id,
    title: `Intervalo de checagem ajustado automaticamente: ${competitor.name}`,
    message: `As últimas checagens de "${competitor.name}" tiveram mediana de ${medianMinutesLabel} min — o intervalo ${isIncrease ? "subiu" : "desceu"} de ${oldMinutes} para ${recommended.minutes} min${isIncrease ? " pra manter uma margem de segurança" : ", já que o site está respondendo mais rápido"}.${marginNote}`,
  });
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
  const startedAt = Date.now();
  const supabase = createServiceClient();

  const lockAcquired = await acquireCheckLock(supabase, competitorId);
  if (!lockAcquired) {
    return { competitorId, errorMessage: "Já existe uma checagem em andamento para este concorrente", ...SKIPPED_RESULT_BASE };
  }

  try {
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
        duration_ms: Date.now() - startedAt,
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
        skippedAlreadyRunning: false,
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
  // totalFailureMessage cobre exceção não tratada (ex: falha na 1ª página
  // html_css, que propaga direto); stoppedEarlyErrorReason cobre o caso em
  // que runPriceCheck RETORNA normalmente com stoppedEarlyDueToError=true
  // (json_api, quando uma página esgota os retries no meio da paginação) —
  // antes desse segundo campo existir, esse caso ficava com error_message
  // vazio, mesmo tendo um motivo real (status HTTP, timeout) descartado
  // dentro de fetchJsonWithRetry. Investigado depois de a Sentineli parar
  // consistentemente ~página 60 sem nenhum detalhe do motivo em
  // scraper_runs.
  const errorMessage = totalFailureMessage ?? result?.stoppedEarlyErrorReason ?? null;

  // Cobertura baixa contra o total que a própria fonte declara (só
  // json_api tem esse dado na checagem de rotina — ver totalDeclared em
  // run-price-check.ts). totalDeclared null (html_css, ou json_api sem
  // total_field) deixa a condição inerte, não bloqueia por falta de dado.
  const totalDeclared = result?.totalDeclared ?? null;
  const looksLowCoverage =
    totalDeclared !== null && totalDeclared > 0 && propertiesCaptured / totalDeclared < DEGRADED_MIN_COVERAGE_RATIO;

  // Extração completou (não foi falha de rede) mas veio vazia, majoritariamente
  // sem preço, ou capturou muito menos do que a fonte declara ter — sinal de
  // seletor obsoleto (ou, no caso de cobertura, de um limite de captura que
  // ficou pequeno demais), não de catálogo esvaziado. Distinto de
  // stoppedEarlyDueToError (que é sobre não CONSEGUIR extrair), mas tem o
  // mesmo efeito prático sobre a confiabilidade dos dados desta execução.
  const configLooksDegraded =
    success &&
    !stoppedEarlyDueToError &&
    (propertiesCaptured === 0 ||
      result!.cardsWithoutPrice / propertiesCaptured >= DEGRADED_MIN_MISSING_PRICE_RATIO ||
      looksLowCoverage);

  // Só compara/persiste quando a extração de fato rodou (mesmo que parcial
  // — os imóveis que FORAM capturados continuam válidos pra comparação).
  // stoppedEarlyDueToError e configLooksDegraded viajam SEPARADOS agora
  // (antes eram um só booleano pré-combinado) — dentro de
  // persistAndDetectChanges, "removido" (inferência por ausência) continua
  // bloqueado pelos dois motivos, mas "adicionado" (inferência por
  // presença) só é bloqueado por configLooksDegraded: falha de rede não
  // torna o que FOI capturado menos confiável, mas dado suspeito (seletor
  // possivelmente quebrado) sim.
  // A linha de scraper_runs precisa existir ANTES de persistAndDetectChanges
  // rodar (não depois, como era antes) — property_changes.scraper_run_id
  // tem uma FK de verdade pra scraper_runs.id, e o insert de cada mudança
  // acontece DENTRO de persistAndDetectChanges. Gravar a linha só no final
  // (como antes da migration 0016) violava a constraint: a mudança tentava
  // referenciar uma execução que ainda não existia na tabela. Por isso o
  // insert acontece aqui, com os campos já conhecidos neste ponto
  // (changes_detected e duration_ms só fecham depois, em finalizeRun).
  const scraperRunId = randomUUID();
  await recordRun(supabase, {
    id: scraperRunId,
    competitor_id: competitorId,
    run_type: "checagem",
    success,
    properties_captured: propertiesCaptured,
    changes_detected: 0,
    error_message: errorMessage,
    stopped_early_due_to_error: stoppedEarlyDueToError,
    duration_ms: null,
  });

  const { changesDetected, changes } = result
    ? await persistAndDetectChanges(supabase, competitorId, result.properties, {
        stoppedEarlyDueToError,
        configLooksDegraded,
        scraperRunId,
      })
    : { changesDetected: 0, changes: [] };

  if (changes.length > 0) {
    await notifyPropertyChanges(supabase, competitor.account_id, competitorId, competitor.name, changes);
  }

  if (configLooksDegraded) {
    await supabase.from("site_configs").update({ status: "degradado" }).eq("id", siteConfig.id);
    await createNotification(supabase, {
      accountId: competitor.account_id,
      competitorId,
      title: `Concorrente com seletores desatualizados: ${competitor.name}`,
      message: `"${competitor.name}" capturou ${propertiesCaptured} imóveis${
        propertiesCaptured > 0 ? ` (${result!.cardsWithoutPrice} sem preço)` : ""
      }${
        looksLowCoverage ? ` — bem abaixo dos ${totalDeclared} declarados pela própria fonte` : ""
      } nesta checagem — provável mudança no site. O config foi marcado como degradado; a recalibração automática via IA vai rodar na próxima varredura (Etapa 7).`,
    });
  }

  let pausedByCircuitBreaker = false;
  let reactivatedAfterSuccess = false;

  if (stoppedEarlyDueToError) {
    const consecutiveFailures = await countConsecutiveNetworkFailures(supabase, competitorId, scraperRunId);
    if (consecutiveFailures + 1 >= CONSECUTIVE_FAILURE_THRESHOLD) {
      await supabase.from("competitors").update({ status: "pausado" }).eq("id", competitorId);
      await createNotification(supabase, {
        accountId: competitor.account_id,
        competitorId,
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

  await finalizeRun(supabase, scraperRunId, changesDetected, Date.now() - startedAt);

  // Só reavalia com execuções limpas — uma que parou cedo por erro de rede
  // ou que veio degradada (seletor quebrado) não representa a duração real
  // de uma captura completa, subiria o intervalo por um motivo errado.
  if (success && !stoppedEarlyDueToError && !configLooksDegraded) {
    await maybeAdjustPollingInterval(supabase, {
      id: competitorId,
      account_id: competitor.account_id,
      name: competitor.name,
      polling_interval_minutes: competitor.polling_interval_minutes,
    });
  }

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
    errorMessage,
    properties: result?.properties ?? [],
    skippedAlreadyRunning: false,
  };
  } finally {
    // Libera o lock em QUALQUER saída do try (sucesso, throw, o early
    // return de "sem site_config ativo") — sem isso, um erro inesperado
    // deixaria o concorrente preso até o timeout de STALE_LOCK_MINUTES.
    await releaseCheckLock(supabase, competitorId);
  }
}
