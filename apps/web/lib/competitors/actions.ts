"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkCompetitor } from "scraper/jobs/check-competitor";
import { learnSiteConfig } from "scraper/jobs/learn-site-config";
import { RobotsDisallowedError } from "scraper/core/robots";
import { minimumSafeIntervalMinutes } from "scraper/core/polling-interval";
import { createNotification } from "scraper/core/notify";
import { ALLOWED_POLLING_INTERVALS, REGISTRATION_MIN_COVERAGE_RATIO } from "./constants";
import { normalizeListingUrl } from "./normalize-url";
import { logAuditEvent } from "@/lib/audit/log";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// Compartilhado entre registerCompetitorAction (cadastro novo) e
// updateCompetitorStatusAction (reativar um arquivado) — os dois únicos
// jeitos de um concorrente virar "contável" de novo. accounts.max_competitors
// null = sem limite (accounts.max_competitors, migration 0028). Arquivado
// não conta pro limite de propósito — é o jeito de "abrir espaço" sem
// perder o histórico do concorrente removido.
async function assertUnderCompetitorLimit(
  supabase: SupabaseClient<Database>,
  accountId: string
): Promise<{ error?: string }> {
  const { data: account } = await supabase.from("accounts").select("max_competitors").eq("id", accountId).maybeSingle();
  const maxCompetitors = account?.max_competitors ?? null;
  if (maxCompetitors === null) return {};

  const { count, error } = await supabase
    .from("competitors")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .neq("status", "arquivado");
  if (error) return { error: `Falha ao checar limite de concorrentes: ${error.message}` };

  if ((count ?? 0) >= maxCompetitors) {
    return {
      error: `Limite de ${maxCompetitors} concorrentes atingido para esta conta — arquive ou exclua algum antes, ou peça a um SuperAdmin pra aumentar o limite em Configurações.`,
    };
  }
  return {};
}

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
    skippedAlreadyRunning: boolean;
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
        skippedAlreadyRunning: result.skippedAlreadyRunning,
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
    // true quando cardsFound/totalListingsHint < REGISTRATION_MIN_COVERAGE_RATIO
    // — o Admin não pode auto-aprovar (confirmSiteConfigAction recusa no
    // servidor mesmo que esta flag seja ignorada no cliente); só um
    // SuperAdmin. false quando totalListingsHint é desconhecido (não dá
    // pra calcular cobertura sem ele — não bloqueia por falta de dado).
    requiresSuperAdminApproval: boolean;
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

  if (!name) return { error: "Nome é obrigatório" };
  if (!abbreviation || abbreviation.length > 6) return { error: "Abreviação precisa ter entre 1 e 6 caracteres" };
  if (!listingUrl || !listingUrl.startsWith("http")) return { error: "URL da listagem inválida" };

  const supabase = await createClient();

  // Checa o teto ANTES de aprender o site via IA (caro/lento) — falha
  // rápido e barato quando a conta já está no limite.
  const limitCheck = await assertUnderCompetitorLimit(supabase, profile.account_id);
  if (limitCheck.error) return { error: limitCheck.error };

  // Pré-checagem amigável — independe do status (ativo/pausado/erro/
  // arquivado), mesma normalização de listing_url_normalized no banco (ver
  // normalize-url.ts). A proteção definitiva é a constraint UNIQUE; isso
  // aqui só evita o usuário ver um erro cru de "duplicate key" quando dá
  // pra avisar antes e, se for o caso, sugerir reativar em vez de recadastrar.
  const normalizedUrl = normalizeListingUrl(listingUrl);
  const { data: existing } = await supabase
    .from("competitors")
    .select("id, name, status")
    .eq("account_id", profile.account_id)
    .eq("listing_url_normalized", normalizedUrl)
    .maybeSingle();
  if (existing) {
    if (existing.status === "arquivado") {
      return {
        error: `"${existing.name}" já foi cadastrado antes com esta URL e está arquivado — reative-o na aba Arquivados em vez de cadastrar de novo (evita aprender o site outra vez).`,
      };
    }

    // Mesmo critério de page.tsx (awaitingApprovalIds) — cadastro novo cuja
    // única config ainda está pendente_revisao, nunca teve nada ativo.
    // Mensagem específica em vez do genérico "já cadastrado": pedido do
    // usuário depois de perceber que o Admin tentava recadastrar a mesma URL
    // sem saber que já existia um cadastro esperando o SuperAdmin.
    const { data: existingConfigs } = await supabase.from("site_configs").select("version, status").eq("competitor_id", existing.id);
    const hasActive = (existingConfigs ?? []).some((sc) => sc.status === "ativo");
    const hasPendingFresh = (existingConfigs ?? []).some((sc) => sc.version === 1 && sc.status === "pendente_revisao");
    if (!hasActive && hasPendingFresh) {
      return {
        error: `"${existing.name}" já foi cadastrado com esta URL e está aguardando aprovação de um SuperAdmin — espere a revisão (ou descarte esse cadastro na tela de revisão, se ela ainda estiver aberta) antes de tentar recadastrar.`,
      };
    }

    return { error: `"${existing.name}" já está cadastrado nesta conta com esta URL.` };
  }

  // polling_interval_minutes NÃO vem do formulário de propósito — pedir
  // pro Admin escolher "no escuro" no cadastro não fazia sentido depois
  // que o intervalo passou a ser calculado a partir da duração REAL
  // medida (maybeAdjustPollingInterval, check-competitor.ts): a primeira
  // checagem completa já ajusta sozinha se precisar, exatamente como as
  // reavaliações seguintes. Nasce no default da coluna (5min, o menor
  // degrau — ver migration 0001) e sobe sozinho se a duração medida
  // exigir mais margem.
  const { data: competitor, error: insertError } = await supabase
    .from("competitors")
    .insert({
      account_id: profile.account_id,
      name,
      abbreviation,
      listing_url: listingUrl,
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
        cards_found: learned.stats.cardsFound,
      })
      .select("id")
      .single();
    if (siteConfigError || !siteConfig) {
      return { learningError: `Concorrente cadastrado, mas falha ao salvar a configuração aprendida: ${siteConfigError?.message}` };
    }

    const hasPagination = learned.selectors.strategy === "html_css" && learned.selectors.pagination.type !== "none";

    // Gate de qualidade: cobertura abaixo do limite bloqueia auto-aprovação
    // pelo Admin da própria conta (confirmSiteConfigAction recusa isso de
    // verdade no servidor — este cálculo aqui só decide a MENSAGEM/UI, não
    // é a garantia). totalListingsHint null → não dá pra calcular
    // cobertura, não bloqueia por falta de dado.
    const { totalListingsHint, cardsFound } = learned.stats;
    const coverageRatio = totalListingsHint && totalListingsHint > 0 ? cardsFound / totalListingsHint : null;
    const requiresSuperAdminApproval = coverageRatio !== null && coverageRatio < REGISTRATION_MIN_COVERAGE_RATIO;

    // Notificação NÃO dispara mais sozinha aqui — pedido do usuário pra que o
    // Admin decida explicitamente clicando "Enviar para o SuperAdmin"
    // (sendToSuperAdminAction abaixo). Até esse clique, o site_config fica
    // 'pendente_revisao' mas invisível pro SuperAdmin (ver filtro em
    // get-pending-site-configs.ts/get-account-settings-data.ts por
    // sent_to_superadmin_at).

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
        requiresSuperAdminApproval,
      },
    };
  } catch (err) {
    // robots.txt proibindo explicitamente este caminho é tratado diferente
    // de qualquer outra falha de aprendizado: não é uma falha técnica
    // retentável (site fora do ar, seletor não identificado) — é o próprio
    // site dizendo que não quer coleta automatizada ali. Por isso desfaz o
    // cadastro (diferente do catch abaixo, que mantém o concorrente criado
    // pro Admin recalibrar depois) e devolve um erro específico, não o
    // "learningError" genérico — não faz sentido oferecer "rode a
    // recalibração manualmente", já que ela ia bater no mesmo bloqueio.
    if (err instanceof RobotsDisallowedError) {
      await supabase.from("competitors").delete().eq("id", competitor.id);
      await logAuditEvent({
        actorUserId: profile.id,
        accountId: profile.account_id,
        actionType: "competitor_registration_blocked_by_robots",
        targetType: "competitor",
        targetId: competitor.id,
        details: { name, abbreviation, listingUrl },
      });
      revalidatePath("/admin/competitors");
      const target = new URL(listingUrl);
      return {
        error: `Cadastro bloqueado: o robots.txt de ${target.origin} proíbe explicitamente a coleta em "${target.pathname}". Não é possível monitorar este concorrente sem violar as regras de automação que o próprio site publica.`,
      };
    }

    // Concorrente já existe (commit acima) — só o aprendizado falhou.
    // Não desfaz o cadastro: o Admin pode tentar recalibrar depois.
    return {
      learningError: `Concorrente cadastrado, mas o aprendizado automático falhou: ${
        err instanceof Error ? err.message : String(err)
      }. Ele não será checado até uma configuração ser aprendida (rode a recalibração manualmente ou recadastre).`,
    };
  }
}

export interface SendToSuperAdminState {
  error?: string;
  success?: boolean;
}

// Dispara a notificação pro SuperAdmin sob demanda — antes disso o
// site_config já nasce 'pendente_revisao' (cobertura baixa, version=1) mas
// fica invisível pro SuperAdmin (ver filtro por sent_to_superadmin_at em
// get-pending-site-configs.ts/get-account-settings-data.ts). Clicar aqui
// sempre dispara de verdade, sem diálogo de confirmação no meio: um único
// botão ("ENVIAR PARA O SUPERADMIN") já causa o envio; a tela só mostra
// "Entendido!" depois, como reconhecimento — não como uma segunda chance de
// cancelar o que já foi enviado.
export async function sendToSuperAdminAction(siteConfigId: string): Promise<SendToSuperAdminState> {
  const profile = await requireRole(["admin", "gerente"]);
  if (!profile.account_id) return { error: "Conta inválida" };
  const supabase = await createClient();

  const { data: siteConfig } = await supabase
    .from("site_configs")
    .select("id, competitor_id, version, status, cards_found, selectors, sent_to_superadmin_at")
    .eq("id", siteConfigId)
    .single();
  const { data: competitor } = siteConfig
    ? await supabase.from("competitors").select("id, account_id, name").eq("id", siteConfig.competitor_id).single()
    : { data: null };

  if (!siteConfig || !competitor || competitor.account_id !== profile.account_id) {
    return { error: "Configuração não encontrada ou não pertence à sua conta" };
  }
  if (siteConfig.version !== 1 || siteConfig.status !== "pendente_revisao") {
    return { error: "Este cadastro não está mais aguardando envio." };
  }
  if (siteConfig.sent_to_superadmin_at) {
    return { success: true };
  }

  const { error: updateError } = await supabase
    .from("site_configs")
    .update({ sent_to_superadmin_at: new Date().toISOString() })
    .eq("id", siteConfigId);
  if (updateError) return { error: `Falha ao enviar: ${updateError.message}` };

  const totalListingsHint = (siteConfig.selectors as { total_listings_hint?: number | null } | null)?.total_listings_hint ?? null;
  const cardsFound = siteConfig.cards_found;
  const coverageRatio = cardsFound !== null && totalListingsHint && totalListingsHint > 0 ? cardsFound / totalListingsHint : null;

  // notifications não tem policy de INSERT pra membros da conta (só
  // SuperAdmin/service role) — service client só pra esta chamada, mesmo
  // padrão já usado por check-competitor.ts/recalibrate-site-config.ts.
  await createNotification(createServiceClient(), {
    accountId: profile.account_id,
    competitorId: competitor.id,
    title: `Cadastro aguardando aprovação: ${competitor.name}`,
    message:
      coverageRatio !== null
        ? `"${competitor.name}" capturou ${cardsFound} de ${totalListingsHint} imóveis declarados (${Math.round(
            coverageRatio * 100
          )}%) — cobertura baixa demais para auto-aprovação. Um SuperAdmin precisa revisar antes de ativar.`
        : `"${competitor.name}" está aguardando revisão de um SuperAdmin antes de ativar.`,
  });

  await logAuditEvent({
    actorUserId: profile.id,
    accountId: profile.account_id,
    actionType: "site_config_sent_to_superadmin",
    targetType: "site_config",
    targetId: siteConfigId,
    details: { competitorName: competitor.name },
  });

  revalidatePath("/admin/competitors");
  return { success: true };
}

export interface ConfirmSiteConfigState {
  error?: string;
  success?: boolean;
}

// Mutação de verdade, compartilhada entre o Admin (self-service, cliente
// RLS-scoped) e o SuperAdmin (em nome de qualquer conta, service role) —
// nenhum dos dois duplica o UPDATE, só a checagem de posse/autorização em
// volta muda por chamador.
async function activateSiteConfig(supabase: SupabaseClient<Database>, siteConfigId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("site_configs")
    .update({ status: "ativo", last_validated_at: new Date().toISOString() })
    .eq("id", siteConfigId);
  if (error) return { error: `Falha ao ativar: ${error.message}` };
  return {};
}

// Mesmo raciocínio de activateSiteConfig acima — mutação única
// (apagar o concorrente inteiro, cascade cuida do site_config junto),
// compartilhada entre Admin e SuperAdmin. Só é segura quando o
// site_config pendente é version=1 (cadastro recém-criado, sem nenhum
// properties/scraper_runs real ainda) — ver rejectPendingRecalibration
// abaixo pro caso de uma recalibração (version>1) de um concorrente que
// JÁ está ativo com histórico de verdade, onde apagar o concorrente
// inteiro destruiria esse histórico só porque a recalibração não presta.
async function discardCompetitor(supabase: SupabaseClient<Database>, competitorId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("competitors").delete().eq("id", competitorId);
  if (error) return { error: `Falha ao descartar: ${error.message}` };
  return {};
}

// Rejeita só a recalibração pendente (apaga a linha de site_configs
// específica) — o concorrente e o site_config ativo anterior (a versão
// mais recente com status='ativo', que continua existindo) ficam
// intocados. Distinto de discardCompetitor: aquele é pra cadastro novo
// sem histórico pra perder; este é pra quando JÁ existe uma versão ativa
// funcionando e a recalibração automática (Etapa 7) gerou algo pior/
// incompatível que não deve substituir a versão que já funciona.
async function rejectPendingRecalibration(supabase: SupabaseClient<Database>, siteConfigId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("site_configs").delete().eq("id", siteConfigId);
  if (error) return { error: `Falha ao rejeitar recalibração: ${error.message}` };
  return {};
}

// Ativa um site_config que estava 'pendente_revisao' depois do Admin
// revisar a prévia de cobertura/confiança na tela.
//
// Dois gates de verdade no SERVIDOR, não só na UI — achado real
// investigando o gate de cobertura: `activateSiteConfig` não conferia
// `version` nem `status` atual, só posse de conta; a única razão de uma
// recalibração incompatível (version>1) nunca ter sido auto-aprovada pelo
// Admin era a UI nunca oferecer esse siteConfigId pra ele, não uma trava
// real — "funcionava por acidente". Corrigido aqui, os dois casos juntos:
//   1. version > 1 SEMPRE recusado pro Admin, incondicionalmente — uma
//      recalibração incompatível com o external_id anterior só pode ser
//      aprovada por um SuperAdmin (confirmSiteConfigActionForSuperAdmin),
//      como já era a intenção desde a Etapa 7.
//   2. version === 1 com cobertura abaixo de REGISTRATION_MIN_COVERAGE_RATIO
//      também recusado — recalculado aqui a partir de cards_found (coluna
//      nova) + total_listings_hint (já dentro de selectors), não confia
//      num booleano pré-computado no cadastro: assim continua correto
//      mesmo se o limite mudar depois de o registro já existir.
export async function confirmSiteConfigAction(siteConfigId: string): Promise<ConfirmSiteConfigState> {
  const profile = await requireRole(["admin", "gerente"]);
  const supabase = await createClient();

  // Duas queries sequenciais, não embed aninhado do PostgREST — o Database
  // type deste projeto é escrito à mão sem metadados de relacionamento
  // completos (mesmo motivo documentado em get-report-data.ts/
  // get-dashboard-data.ts). Confirma posse antes da mutação: a mutação em
  // si já roda com o cliente RLS-scoped do usuário, mas reverificar aqui dá
  // uma mensagem de erro clara em vez de um 0-rows-affected silencioso.
  const { data: siteConfig } = await supabase
    .from("site_configs")
    .select("id, competitor_id, version, cards_found, selectors")
    .eq("id", siteConfigId)
    .single();
  const { data: competitor } = siteConfig
    ? await supabase.from("competitors").select("account_id").eq("id", siteConfig.competitor_id).single()
    : { data: null };

  if (!siteConfig || !competitor || competitor.account_id !== profile.account_id) {
    return { error: "Configuração não encontrada ou não pertence à sua conta" };
  }

  if (siteConfig.version > 1) {
    return {
      error:
        "Esta é uma recalibração de um concorrente já ativo, não um cadastro novo — só um SuperAdmin pode aprovar, pra não arriscar quebrar a continuidade do histórico já existente.",
    };
  }

  const totalListingsHint = (siteConfig.selectors as { total_listings_hint?: number | null } | null)?.total_listings_hint ?? null;
  const cardsFound = siteConfig.cards_found;
  const coverageRatio = cardsFound !== null && totalListingsHint && totalListingsHint > 0 ? cardsFound / totalListingsHint : null;
  if (coverageRatio !== null && coverageRatio < REGISTRATION_MIN_COVERAGE_RATIO) {
    return {
      error: `Cobertura muito baixa (${cardsFound} de ${totalListingsHint} imóveis — ${Math.round(
        coverageRatio * 100
      )}%) para auto-aprovação — um SuperAdmin já foi avisado e precisa revisar antes de ativar.`,
    };
  }

  const result = await activateSiteConfig(supabase, siteConfigId);
  if (result.error) return result;

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

  const result = await discardCompetitor(supabase, competitorId);
  if (result.error) return result;

  revalidatePath("/admin/competitors");
  return { success: true };
}

// Variantes SuperAdmin — mesma mutação (activateSiteConfig/discardCompetitor
// acima), autorização diferente: requireRole("superadmin") em vez de posse
// de conta, service role (bypassa RLS, mesmo padrão já usado em
// superadmin/accounts/[id]/actions.ts) em vez do cliente RLS-scoped, e
// accountId vem explícito (a tela de origem já sabe de qual conta é o
// site_config sendo revisado) — só usado pra reverificar posse contra o
// que está no banco, nunca confiado sozinho.
export async function confirmSiteConfigActionForSuperAdmin(siteConfigId: string, accountId: string): Promise<ConfirmSiteConfigState> {
  const profile = await requireRole("superadmin");
  const supabase = createServiceClient();

  const { data: siteConfig } = await supabase.from("site_configs").select("id, competitor_id").eq("id", siteConfigId).single();
  const { data: competitor } = siteConfig
    ? await supabase.from("competitors").select("account_id, name").eq("id", siteConfig.competitor_id).single()
    : { data: null };

  if (!siteConfig || !competitor || competitor.account_id !== accountId) {
    return { error: "Configuração não encontrada ou não pertence a esta conta" };
  }

  const result = await activateSiteConfig(supabase, siteConfigId);
  if (result.error) return result;

  // Ação cruzando contas (SuperAdmin em nome de uma conta que não é a
  // dele) — auditada, diferente das versões Admin acima (self-service
  // dentro da própria conta, já implicitamente rastreável por quem tem
  // acesso a ela).
  await logAuditEvent({
    actorUserId: profile.id,
    accountId,
    actionType: "site_config_confirmed_by_superadmin",
    targetType: "site_config",
    targetId: siteConfigId,
    details: { competitorName: competitor.name },
  });

  // Avisa a imobiliária cliente que o cadastro que ela mandou esperar (fluxo
  // de baixa cobertura) ou a recalibração pendente foi aprovada — sem isso, o
  // Admin não tinha nenhum jeito de saber que a espera acabou além de ficar
  // checando a tela manualmente. `supabase` aqui já é o service client
  // (mesmo motivo de sempre: notifications não tem policy de INSERT pra
  // membros da conta).
  await createNotification(supabase, {
    accountId,
    competitorId: siteConfig.competitor_id,
    title: `Cadastro aprovado: ${competitor.name}`,
    message: `"${competitor.name}" foi aprovado por um SuperAdmin — já está ativo e as checagens de preço vão rodar normalmente.`,
  });

  revalidatePath(`/superadmin/accounts/${accountId}/settings`);
  return { success: true };
}

// Recebe siteConfigId (não competitorId) de propósito — version só está no
// site_config, e é ela que decide QUAL mutação rodar: version=1 (cadastro
// recém-criado, sem histórico) apaga o concorrente inteiro; version>1
// (recalibração de um concorrente que já tem versão ativa) rejeita só essa
// linha de site_configs, preservando o concorrente/histórico/versão ativa
// anterior intactos. Ver comentário em rejectPendingRecalibration acima —
// essa distinção é a correção de um risco real que existiria se
// discardCompetitor fosse reaproveitado sem checar version primeiro.
export async function discardSiteConfigActionForSuperAdmin(siteConfigId: string, accountId: string): Promise<DiscardSiteConfigState> {
  const profile = await requireRole("superadmin");
  const supabase = createServiceClient();

  const { data: siteConfig } = await supabase
    .from("site_configs")
    .select("id, competitor_id, version")
    .eq("id", siteConfigId)
    .single();
  const { data: competitor } = siteConfig
    ? await supabase.from("competitors").select("id, account_id, name").eq("id", siteConfig.competitor_id).single()
    : { data: null };

  if (!siteConfig || !competitor || competitor.account_id !== accountId) {
    return { error: "Configuração não encontrada ou não pertence a esta conta" };
  }

  const isFreshRegistration = siteConfig.version === 1;
  const result = isFreshRegistration
    ? await discardCompetitor(supabase, competitor.id)
    : await rejectPendingRecalibration(supabase, siteConfigId);
  if (result.error) return result;

  await logAuditEvent({
    actorUserId: profile.id,
    accountId,
    actionType: "site_config_discarded_by_superadmin",
    targetType: isFreshRegistration ? "competitor" : "site_config",
    targetId: isFreshRegistration ? competitor.id : siteConfigId,
    details: { competitorName: competitor.name, competitorDeleted: isFreshRegistration, version: siteConfig.version },
  });

  revalidatePath(`/superadmin/accounts/${accountId}/settings`);
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

  const { data: competitor } = await supabase.from("competitors").select("id, account_id, name, status").eq("id", competitorId).single();
  if (!competitor || competitor.account_id !== profile.account_id) {
    return { error: "Concorrente não encontrado ou não pertence à sua conta" };
  }

  // Reativar um arquivado volta a contar pro limite (ver
  // assertUnderCompetitorLimit) — sem checar aqui, arquivar+desarquivar
  // seria um jeito de furar o teto. Pausar/arquivar nunca precisa dessa
  // checagem (só reduzem ou mantêm a contagem).
  if (newStatus === "ativo" && competitor.status === "arquivado") {
    const limitCheck = await assertUnderCompetitorLimit(supabase, profile.account_id);
    if (limitCheck.error) return { error: limitCheck.error };
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

// 500 causou "TypeError: fetch failed" (não um 400 do PostgREST — falha de
// rede mais cedo, provável limite de tamanho de URL/header) reproduzido
// contra dados reais em get-run-changes.ts, que tinha o mesmo valor.
// Testado empiricamente: 350 funciona, 400 falha. 200 com boa margem.
const ID_CHUNK_SIZE = 200;

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

  // Reforço no servidor — o <select> (interval-select.tsx) já desabilita
  // opções abaixo do mínimo seguro, mas isso é só client-side; sem checar
  // de novo aqui, dava pra forçar um valor inseguro direto pela action
  // (DevTools, chamada manual). Mesmo cálculo de maybeAdjustPollingInterval
  // (packages/scraper/jobs/check-competitor.ts) — duração média das
  // últimas checagens limpas deste concorrente.
  const { data: recentRuns } = await supabase
    .from("scraper_runs")
    .select("duration_ms")
    .eq("competitor_id", competitorId)
    .eq("run_type", "checagem")
    .eq("success", true)
    .eq("stopped_early_due_to_error", false)
    .not("duration_ms", "is", null)
    .order("created_at", { ascending: false })
    .limit(3);
  const durations = (recentRuns ?? []).map((r) => r.duration_ms as number);
  if (durations.length > 0) {
    const avgDurationMs = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const minSafe = minimumSafeIntervalMinutes(avgDurationMs).minutes;
    if (minutes < minSafe) {
      return { error: `Intervalo mínimo seguro para este concorrente é ${minSafe} min (duração média medida das últimas checagens).` };
    }
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
