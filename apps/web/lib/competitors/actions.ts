"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { checkCompetitor } from "scraper/jobs/check-competitor";
import { learnSiteConfig } from "scraper/jobs/learn-site-config";
import { ALLOWED_POLLING_INTERVALS } from "./constants";

export interface CheckCompetitorNowState {
  result?: {
    success: boolean;
    propertiesCaptured: number;
    changesDetected: number;
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
  const profile = await requireRole("admin");
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
    .select("id, account_id")
    .eq("id", competitorId)
    .single();

  if (!competitor || competitor.account_id !== profile.account_id) {
    return { error: "Concorrente não encontrado ou não pertence à sua conta" };
  }

  try {
    const result = await checkCompetitor(competitorId);
    revalidatePath("/admin/competitors");
    return {
      result: {
        success: result.success,
        propertiesCaptured: result.propertiesCaptured,
        changesDetected: result.changesDetected,
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
  const profile = await requireRole("admin");
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
  if (insertError || !competitor) return { error: `Falha ao cadastrar: ${insertError?.message}` };

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
  const profile = await requireRole("admin");
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
  const profile = await requireRole("admin");
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

// Pausar/retomar checagem automática. getDueCompetitors() (Etapa 5,
// packages/scraper/jobs/scheduler.ts) já filtra .eq("status", "ativo") —
// confirmado lendo o código antes de construir este botão, não assumido —
// então um concorrente 'pausado' aqui realmente para de ser verificado
// pelo scheduler, não é só cosmético na tela. "Verificar agora" continua
// funcionando em concorrente pausado de propósito (fluxo de recuperação já
// existente desde a Etapa 5: se der certo, reativa sozinho).
export async function updateCompetitorStatusAction(
  competitorId: string,
  newStatus: "ativo" | "pausado"
): Promise<UpdateCompetitorState> {
  const profile = await requireRole("admin");
  const supabase = await createClient();

  const { data: competitor } = await supabase.from("competitors").select("id, account_id").eq("id", competitorId).single();
  if (!competitor || competitor.account_id !== profile.account_id) {
    return { error: "Concorrente não encontrado ou não pertence à sua conta" };
  }

  const { error } = await supabase.from("competitors").update({ status: newStatus }).eq("id", competitorId);
  if (error) return { error: `Falha ao atualizar status: ${error.message}` };

  revalidatePath("/admin/competitors");
  return { success: true };
}

// Muda o intervalo de checagem. getDueCompetitors() lê polling_interval_minutes
// direto do banco a cada execução (sem cache) — a mudança vale a partir do
// próximo tick do scheduler, sem precisar reiniciar nada.
export async function updateCompetitorIntervalAction(competitorId: string, minutes: number): Promise<UpdateCompetitorState> {
  const profile = await requireRole("admin");
  if (!ALLOWED_POLLING_INTERVALS.includes(minutes as (typeof ALLOWED_POLLING_INTERVALS)[number])) {
    return { error: `Intervalo precisa ser um dos valores permitidos: ${ALLOWED_POLLING_INTERVALS.join(", ")} min` };
  }

  const supabase = await createClient();
  const { data: competitor } = await supabase.from("competitors").select("id, account_id").eq("id", competitorId).single();
  if (!competitor || competitor.account_id !== profile.account_id) {
    return { error: "Concorrente não encontrado ou não pertence à sua conta" };
  }

  const { error } = await supabase.from("competitors").update({ polling_interval_minutes: minutes }).eq("id", competitorId);
  if (error) return { error: `Falha ao atualizar intervalo: ${error.message}` };

  revalidatePath("/admin/competitors");
  return { success: true };
}
