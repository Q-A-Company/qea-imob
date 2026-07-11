import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface PendingSiteConfig {
  id: string;
  competitorId: string;
  competitorName: string;
  version: number;
  strategy: "html_css" | "json_api";
  confidenceScore: number | null;
  warnings: string[];
  createdAt: string;
}

// Detalhe por trás do indicador "N config. de site aguardando revisão" já
// existente em get-account-settings-data.ts (que só contava) — usado pela
// tela de revisão do SuperAdmin (confirmSiteConfigActionForSuperAdmin/
// discardSiteConfigActionForSuperAdmin, lib/competitors/actions.ts). Mesma
// forma de ler confidence_score/warnings/strategy que register-form.tsx usa
// pro Admin, só que a partir de site_configs já persistido (não da resposta
// fresca de learnSiteConfig), já que aqui pode ser uma recalibração antiga,
// não o cadastro do momento.
export async function getPendingSiteConfigs(accountId: string): Promise<PendingSiteConfig[]> {
  const supabase = await createClient();

  const { data: competitors, error: competitorsError } = await supabase
    .from("competitors")
    .select("id, name")
    .eq("account_id", accountId);
  if (competitorsError) throw new Error(`Falha ao buscar concorrentes: ${competitorsError.message}`);
  const competitorIds = (competitors ?? []).map((c) => c.id);
  const competitorNameById = new Map((competitors ?? []).map((c) => [c.id, c.name]));
  if (competitorIds.length === 0) return [];

  const { data: siteConfigs, error: siteConfigsError } = await supabase
    .from("site_configs")
    .select("id, competitor_id, version, confidence_score, selectors, created_at")
    .in("competitor_id", competitorIds)
    .eq("status", "pendente_revisao")
    .order("created_at", { ascending: false });
  if (siteConfigsError) throw new Error(`Falha ao buscar configs pendentes: ${siteConfigsError.message}`);

  return (siteConfigs ?? []).map((sc) => {
    const selectors = sc.selectors as { strategy: "html_css" | "json_api"; warnings?: string[] };
    return {
      id: sc.id,
      competitorId: sc.competitor_id,
      competitorName: competitorNameById.get(sc.competitor_id) ?? "Concorrente removido",
      version: sc.version,
      strategy: selectors.strategy,
      confidenceScore: sc.confidence_score,
      warnings: selectors.warnings ?? [],
      createdAt: sc.created_at,
    };
  });
}
