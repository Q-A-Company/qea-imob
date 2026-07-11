"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { checkCompetitor } from "scraper/jobs/check-competitor";
import { learnSiteConfig } from "scraper/jobs/learn-site-config";
import { ALLOWED_POLLING_INTERVALS } from "./constants";
import { normalizeListingUrl } from "./normalize-url";
import { logAuditEvent } from "@/lib/audit/log";

export interface CheckCompetitorNowState {
  result?: {
    success: boolean;
    propertiesCaptured: number;
    changesDetected: number;
    changesByType: { price: number; added: number; removed: number; reappeared: number };
    stoppedEarlyDueToError: boolean;
    pausedByCircuitBreaker: boolean;
    reactivatedAfterSuccess: boolean;
    configMarkedDegraded: boolean;
    errorMessage: string | null;
  };
  error?: string;
}

// Dispara a mesma lógica de checagem de rotina (Etapa 4/5) + comparação
// (Etapa 6) sob demanda — hoje roda dentro do processo do Next.js por
// simplicidade (não há worker separado deployado ainda); numa implantação
// real, isso chamaria o worker (Railway) em vez de importar
// packages/scraper diretamente. packages/scraper é pré-compilado para
// dist/ antes do build/dev (ver package.json "exports" e prebuild/predev).
export async function checkCompetitorNowAction(
  _prevState: CheckCompetitorNowState,
  formData: FormData
): Promise<CheckCompetitorNowState> {
  const profile = await requireRole(["admin", "gerente"]);
  const competitorId = formData.get("competitorId");

  if (typeof competitorId !== "string" || !competitorId) {
    return { error: "ID do concorrente inválido" };
  }

  const supabase = await createClient();

  // check-competitor.ts usa a service role (bypassa RLS) — confirmamos aqui,
  // com a sessão real do usuário logado, que o concorrente pertence à conta
  // dele antes de rodar a checagem privilegiada.
  const { data: competitor } = await supabase
    .from("competitors")
    .select("id, account_id, name")
    .eq("id", competitorId)
    .single();

  if (!competitor || competitor.account_id !== profile.account_id) {
    return { error: "Concorrente não encontrado ou não pertence à sua conta" };
  }

  await logAuditEvent({
    actorUserId: profile.id,
    accountId: profile.account_id,
    actionType: "competitor_check_triggered",
    targetType: "competitor",
    targetId: competitorId,
    details: { name: competitor.name },
  });

  try {
    const result = await checkCompetitor(competitorId);
    revalidatePath("/admin/competitors");
    return {
      result: {
        success: result.success,
        propertiesCaptured: result.propertiesCaptured,
        changesDetected: result.changesDetected,
        changesByType: result.changesByType,
        stoppedEarlyDueToError: result.stoppedEarlyDueToError,
        pausedByCircuitBreaker: result.pausedByCircuitBreaker,
        reactivatedAfterSuccess: result.reactivatedAfterSuccess,
        configMarkedDegraded: result.configMarkedDegraded,
        errorMessage: result.errorMessage,
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro desconhecido ao checar o concorrente" };
  }
}

export interface RegisterCompetitorState {
  error?: string;
  learning?: {
    competitorId: string;
    siteConfigId: string;
    strategy: "html_css" | "json_api";
    cardsFound: number;
    totalListingsHint: number | null;
    confidenceScore: number;
    warnings: string[];
    externalIdSanityOk: boolean;
    // true quando a paginação FOI detectada (html_css com pagination.type
    // != 'none') mas mesmo assim não deu pra estimar totalListingsHint —
    // rede de segurança visual pro caso em que nem o número da última
    // página está disponível (ver README, caso "Realler"): sem isso, o
    // Admin via só "8 imóveis capturados (total do site desconhecido)",
    // sem nenhum sinal de que a prévia é uma AMOSTRA da página 1, não o
    // catálogo inteiro. json_api nunca marca isso — sua prévia já é
    // exaustiva (extractFromJsonApi pagina de verdade durante o aprendizado).
    paginationDetectedWithoutTotal: boolean;
  };
  // Preenchido só quando o competitor FOI criado mas o aprendizado via IA
  // falhou (site fora do ar, timeout, etc.) — distinto de `error`, que
  // significa que nada foi criado. O concorrente fica sem site_config
  // ativo; checkCompetitor já trata isso graciosamente ("nenhum site_config
  // ativo"), só não roda checagem até alguém rodar a recalibração manual
  // (packages/scraper/jobs/recalibrate-site-config.ts) ou recadastrar.
  learningError?: string;
}

// Cadastra o concorrente e roda o aprendizado via IA (Etapa 3) no mesmo
// submit — mas NÃO ativa o site_config sozinho. Fica salvo com
// status = 'pendente_revisao' (mesmo valor já usado pela Etapa 7 pra
// recalibração incompatível — reaproveitado aqui, sem migration nova:
// check-competitor.ts já só considera site_configs com status='ativo', então
// um 'pendente_revisao' fica automaticamente de fora das checagens até
// alguém confirmar). O Admin revisa cobertura/confiança/warnings na tela e
// decide: confirmSiteConfigAction (ativa) ou discardSiteConfigAction
// (descarta e tenta de novo). Decisão de segurança pedida explicitamente
// depois de ver, na prática, sites com cobertura muito baixa (Débora 0%,
// CEW 3,7%) — ativar sem revisão arriscava publicar um config ruim
// silenciosamente.
export async function registerCompetitorAction(
  _prevState: RegisterCompetitorState,
  formData: FormData
): Promise<RegisterCompetitorState> {
  const profile = await requireRole(["admin", "gerente"]);
  if (!profile.account_id) return { error: "Conta inválida" };

  const name = String(formData.get("name") ?? "").trim();
  const abbreviation = String(formData.get("abbreviation") ?? "").trim().toUpperCase();
  const listingUrl = String(formData.get("listingUrl") ?? "").trim();
  const pollingIntervalRaw = String(formData.get("pollingIntervalMinutes") ?? "");
  const pollingIntervalMinutes = Number(pollingIntervalRaw);

  if (!name) return { error: "Nome é obrigatório" };
  if (!abbreviation || abbreviation.length > 6) return { error: "Abreviação precisa ter entre 1 e 6 caracteres" };
  if (!listingUrl || !listingUrl.startsWith("http")) return { error: "URL da listagem inválida" };
  if (!ALLOWED_POLLING_INTERVALS.includes(pollingIntervalMinutes as (typeof ALLOWED_POLLING_INTERVALS)[number])) {
    return { error: `Intervalo precisa ser um dos valores permitidos: ${ALLOWED_POLLING_INTERVALS.join(", ")} min` };
  }

  const supabase = await createClient();

  // Pré-checagem amigável — independe do status (ativo/pausado/erro/
  // arquivado), mesma normalização de listing_url_normalized no banco (ver
  // normalize-url.ts). A proteção definitiva é a constraint UNIQUE; isso
  // aqui só evita o usuário ver um erro cru de "duplicate key" quando dá
  // pra avisar antes e, se for o caso, sugerir reativar em vez de recadastrar.
  const normalizedUrl = normalizeListingUrl(listingUrl);
  const { data: existing } = await supabase
    .from("competitors")
    .select("name, status")
    .eq("account_id", profile.account_id)
    .eq("listing_url_normalized", normalizedUrl)
    .maybeSingle();
  if (existing) {
    if (existing.status === "arquivado") {
      return {
        error: `"${existing.name}" já foi cadastrado antes com esta URL e está arquivado — reative-o na aba Arquivados em vez de cadastrar de novo (evita aprender o site outra vez).`,
      };
    }
    return { error: `"${existing.name}" já está cadastrado nesta conta com esta URL.` };
  }

  const { data: competitor, error: insertError } = await supabase
    .from("competitors")
    .insert({
      account_id: profile.account_id,
      name,
      abbreviation,
      listing_url: listingUrl,
      polling_interval_minutes: pollingIntervalMinutes,
      status: "ativo",
    })
    .select("id")
    .single();
  if (insertError) {
    // Rede de segurança contra corrida (dois cadastros simultâneos passando
    // pela pré-checagem acima antes de qualquer um commitar) — 23505 é o
    // código do Postgres pra unique_violation, aqui só pode ser a
    // constraint competitors_account_listing_url_unique.
    if (insertError.code === "23505") {
      return { error: "Esse concorrente já está cadastrado nesta conta com esta URL (detectado no momento do cadastro)." };
    }
    return { error: `Falha ao cadastrar: ${insertError.message}` };
  }
  if (!competitor) return { error: "Falha ao cadastrar: nenhum registro retornado" };

  await logAuditEvent({
    actorUserId: profile.id,
    accountId: profile.account_id,
    actionType: "competitor_created",
    targetType: "competitor",
    targetId: competitor.id,
    details: { name, abbreviation, listingUrl },
  });
  revalidatePath("/admin/competitors");

  try {
    const learned = await learnSiteConfig(listingUrl);
    const { data: siteConfig, error: siteConfigError } = await supabase
      .from("site_configs")
      .insert({
        competitor_id: competitor.id,
        selectors: learned.selectors,
        version: 1,
        confidence_score: learned.selectors.confidence_score,
        status: "pendente_revisao",
      })
      .select("id")
      .single();
    if (siteConfigError || !siteConfig) {
      return { learningError: `Concorrente cadastrado, mas falha ao salvar a configuração aprendida: ${siteConfigError?.message}` };
    }

    const hasPagination = learned.selectors.strategy === "html_css" && learned.selectors.pagination.type !== "none";

    return {
      learning: {
        competitorId: competitor.id,
        siteConfigId: siteConfig.id,
        strategy: learned.selectors.strategy,
        cardsFound: learned.stats.cardsFound,
        totalListingsHint: learned.stats.totalListingsHint,
        confidenceScore: learned.selectors.confidence_score,
        warnings: learned.selectors.warnings,
        externalIdSanityOk: learned.externalIdSanityOk,
        paginationDetectedWithoutTotal: hasPagination && learned.stats.totalListingsHint === null,
      },
    };
  } catch (err) {
    // Concorrente já existe (commit acima) — só o aprendizado falhou.
    // Não desfaz o cadastro: o Admin pode tentar recalibrar depois.
    return {
      learningError: `Concorrente cadastrado, mas o aprendizado automático falhou: ${
        err instanceof Error ? err.message : String(err)
      }. Ele não será checado até uma configuração ser aprendida (rode a recalibração manualmente ou recadastre).`,
    };
  }
}

export interface ConfirmSiteConfigState {
  error?: string;
  success?: boolean;
}

// Ativa um site_config que estava 'pendente_revisao' depois do Admin
// revisar a prévia de cobertura/confiança na tela.
export async function confirmSiteConfigAction(siteConfigId: string): Promise<ConfirmSiteConfigState> {
  const profile = await requireRole(["admin", "gerente"]);
  const supabase = await createClient();

  // Duas queries sequenciais, não embed aninhado do PostgREST — o Database
  // type deste projeto é escrito à mão sem metadados de relacionamento
  // completos (mesmo motivo documentado em get-report-data.ts/
  // get-dashboard-data.ts). Confirma posse antes da mutação: a mutação em
  // si já roda com o cliente RLS-scoped do usuário, mas reverificar aqui dá
  // uma mensagem de erro clara em vez de um 0-rows-affected silencioso.
  const { data: siteConfig } = await supabase.from("site_configs").select("id, competitor_id").eq("id", siteConfigId).single();
  const { data: competitor } = siteConfig
    ? await supabase.from("competitors").select("account_id").eq("id", siteConfig.competitor_id).single()
    : { data: null };

  if (!siteConfig || !competitor || competitor.account_id !== profile.account_id) {
    return { error: "Configuração não encontrada ou não pertence à sua conta" };
  }

  const { error } = await supabase
    .from("site_configs")
    .update({ status: "ativo", last_validated_at: new Date().toISOString() })
    .eq("id", siteConfigId);
  if (error) return { error: `Falha ao ativar: ${error.message}` };

  revalidatePath("/admin/competitors");
  return { success: true };
}

export interface DiscardSiteConfigState {
  error?: string;
  success?: boolean;
}

// Descarta um cadastro recém-criado (concorrente + site_config
// pendente_revisao) quando o Admin não gosta da cobertura/confiança da
// prévia — apaga o concorrente inteiro (cascade apaga o site_config junto),
// não só desativa, porque nesse ponto o concorrente ainda não tem nenhum
// histórico real (properties/scraper_runs) que valha preservar.
export async function discardSiteConfigAction(competitorId: string): Promise<DiscardSiteConfigState> {
  const profile = await requireRole(["admin", "gerente"]);
  const supabase = await createClient();

  const { data: competitor } = await supabase.from("competitors").select("id, account_id").eq("id", competitorId).single();
  if (!competitor || competitor.account_id !== profile.account_id) {
    return { error: "Concorrente não encontrado ou não pertence à sua conta" };
  }

  const { error } = await supabase.from("competitors").delete().eq("id", competitorId);
  if (error) return { error: `Falha ao descartar: ${error.message}` };

  revalidatePath("/admin/competitors");
  return { success: true };
}

export interface UpdateCompetitorState {
  error?: string;
  success?: boolean;
}

// Pausar/retomar/arquivar/reativar — todas as transições de status que o
// usuário controla diretamente (getDueCompetitors(), packages/scraper/jobs/
// scheduler.ts, já filtra .eq("status", "ativo") — confirmado lendo o
// código antes de construir este botão, não assumido — então tanto
// 'pausado' quanto 'arquivado' aqui realmente param de ser verificados
// pelo scheduler, não é só cosmético na tela). 'erro' fica de fora de
// propósito: só o circuit breaker do scraper define isso, nunca uma ação
// direta do usuário. Arquivar/reativar reaproveita esta mesma action (não
// uma nova) — é a mesma mecânica de trocar status + checar posse, só um
// valor a mais; volta pra 'ativo' direto, sem re-rodar aprendizado via IA,
// já que o site_config antigo continua válido. "Verificar agora" continua
// funcionando em concorrente pausado de propósito (fluxo de recuperação já
// existente desde a Etapa 5: se der certo, reativa sozinho).
export async function updateCompetitorStatusAction(
  competitorId: string,
  newStatus: "ativo" | "pausado" | "arquivado"
): Promise<UpdateCompetitorState> {
  const profile = await requireRole(["admin", "gerente"]);
  const supabase = await createClient();

  const { data: competitor } = await supabase.from("competitors").select("id, account_id, name").eq("id", competitorId).single();
  if (!competitor || competitor.account_id !== profile.account_id) {
    return { error: "Concorrente não encontrado ou não pertence à sua conta" };
  }

  const { error } = await supabase.from("competitors").update({ status: newStatus }).eq("id", competitorId);
  if (error) return { error: `Falha ao atualizar status: ${error.message}` };

  await logAuditEvent({
    actorUserId: profile.id,
    accountId: profile.account_id,
    actionType: "competitor_status_changed",
    targetType: "competitor",
    targetId: competitorId,
    details: { newStatus, name: competitor.name },
  });
  revalidatePath("/admin/competitors");
  return { success: true };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

const ID_CHUNK_SIZE = 500;

export interface DeleteCompetitorState {
  error?: string;
  success?: boolean;
}

// Exclusão definitiva — segundo nível, mais escondido (só acessível a
// partir da aba Arquivados na UI, atrás de um modal de confirmação forte),
// diferente de arquivar (updateCompetitorStatusAction com
// newStatus='arquivado': reversível, não apaga nada). Cascade do banco já
// cobre site_configs/properties/property_changes/scraper_runs (FK
// `on delete cascade` em cada uma, ver supabase/migrations/0001_init.sql) —
// só notifications precisa de exclusão EXPLÍCITA aqui, porque
// notifications.property_change_id é `on delete set null`, não cascade
// (pensado pra sobreviver a limpezas de property_changes antigas mantendo
// o texto da notificação já denormalizado) — sem isso, excluir o
// concorrente deixaria notificações "órfãs" (title/message intactos, só
// sem o vínculo) em vez de realmente apagadas, que é o que foi pedido.
//
// Busca paginada (.range() explícito) em vez de um .select() solto — mesma
// lição já documentada em packages/scraper/jobs/send-daily-digest.ts: sem
// isso, o Postgres/PostgREST corta silenciosamente em 1000 linhas. IDs em
// lotes de 500 pro .in() — evita o outro bug já visto nesta sessão (lista
// de IDs grande demais quebrando a query).
export async function deleteCompetitorPermanentlyAction(competitorId: string): Promise<DeleteCompetitorState> {
  const profile = await requireRole(["admin", "gerente"]);
  const supabase = await createClient();

  const { data: competitor } = await supabase.from("competitors").select("id, account_id, name").eq("id", competitorId).single();
  if (!competitor || competitor.account_id !== profile.account_id) {
    return { error: "Concorrente não encontrado ou não pertence à sua conta" };
  }

  const propertyIds: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("properties").select("id").eq("competitor_id", competitorId).range(offset, offset + 999);
    if (error) return { error: `Falha ao buscar imóveis do concorrente: ${error.message}` };
    propertyIds.push(...(data ?? []).map((p) => p.id));
    if (!data || data.length < 1000) break;
  }

  const changeIds: string[] = [];
  for (const idsChunk of chunk(propertyIds, ID_CHUNK_SIZE)) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from("property_changes").select("id").in("property_id", idsChunk).range(offset, offset + 999);
      if (error) return { error: `Falha ao buscar histórico de mudanças: ${error.message}` };
      changeIds.push(...(data ?? []).map((c) => c.id));
      if (!data || data.length < 1000) break;
    }
  }

  for (const idsChunk of chunk(changeIds, ID_CHUNK_SIZE)) {
    const { error } = await supabase.from("notifications").delete().in("property_change_id", idsChunk);
    if (error) return { error: `Falha ao apagar notificações relacionadas: ${error.message}` };
  }

  const { error: deleteError } = await supabase.from("competitors").delete().eq("id", competitorId);
  if (deleteError) return { error: `Falha ao excluir concorrente: ${deleteError.message}` };

  await logAuditEvent({
    actorUserId: profile.id,
    accountId: profile.account_id,
    actionType: "competitor_deleted",
    targetType: "competitor",
    targetId: competitorId,
    details: { name: competitor.name },
  });
  revalidatePath("/admin/competitors");
  return { success: true };
}

// Muda o intervalo de checagem. getDueCompetitors() lê polling_interval_minutes
// direto do banco a cada execução (sem cache) — a mudança vale a partir do
// próximo tick do scheduler, sem precisar reiniciar nada.
export async function updateCompetitorIntervalAction(competitorId: string, minutes: number): Promise<UpdateCompetitorState> {
  const profile = await requireRole(["admin", "gerente"]);
  if (!ALLOWED_POLLING_INTERVALS.includes(minutes as (typeof ALLOWED_POLLING_INTERVALS)[number])) {
    return { error: `Intervalo precisa ser um dos valores permitidos: ${ALLOWED_POLLING_INTERVALS.join(", ")} min` };
  }

  const supabase = await createClient();
  const { data: competitor } = await supabase.from("competitors").select("id, account_id, name").eq("id", competitorId).single();
  if (!competitor || competitor.account_id !== profile.account_id) {
    return { error: "Concorrente não encontrado ou não pertence à sua conta" };
  }

  const { error } = await supabase.from("competitors").update({ polling_interval_minutes: minutes }).eq("id", competitorId);
  if (error) return { error: `Falha ao atualizar intervalo: ${error.message}` };

  await logAuditEvent({
    actorUserId: profile.id,
    accountId: profile.account_id,
    actionType: "competitor_interval_changed",
    targetType: "competitor",
    targetId: competitorId,
    details: { minutes, name: competitor.name },
  });
  revalidatePath("/admin/competitors");
  return { success: true };
}
