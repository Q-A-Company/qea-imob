"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { checkCompetitor } from "scraper/jobs/check-competitor";

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
}

// Cadastro deliberadamente mínimo — só os campos necessários pra Etapa 10
// (dashboard/gráficos, precisa de abbreviation) funcionar. Não roda
// aprendizado via IA aqui (isso ainda é feito por script, ver
// packages/scraper/jobs/learn-site-config.ts) — o concorrente entra sem
// site_config, e checkCompetitor já trata esse caso graciosamente
// ("Nenhum site_config ativo"). Preview de IA/onboarding completo continua
// pendente de um trabalho futuro dedicado.
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
  if (!Number.isFinite(pollingIntervalMinutes) || pollingIntervalMinutes <= 0) {
    return { error: "Intervalo de checagem inválido" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("competitors").insert({
    account_id: profile.account_id,
    name,
    abbreviation,
    listing_url: listingUrl,
    polling_interval_minutes: pollingIntervalMinutes,
    status: "ativo",
  });
  if (error) return { error: `Falha ao cadastrar: ${error.message}` };

  revalidatePath("/admin/competitors");
  return {};
}
