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
