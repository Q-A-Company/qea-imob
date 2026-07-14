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
  // Cobertura (cards_found/total_listings_hint) — cardsFound vem da coluna
  // nova site_configs.cards_found (null pra configs gravados antes dela
  // existir); totalListingsHint já morava dentro de selectors, só não era
  // repassado por este arquivo. null em qualquer um dos dois = cobertura
  // desconhecida, não exibir percentual.
  cardsFound: number | null;
  totalListingsHint: number | null;
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

  // version>1 (recalibração incompatível) sempre aparece, como sempre —
  // version=1 (cadastro de baixa cobertura) só depois que o Admin clicar
  // "Enviar para o SuperAdmin" (sendToSuperAdminAction preenche
  // sent_to_superadmin_at). Sem este filtro, todo cadastro pendente
  // apareceria pro SuperAdmin antes do Admin decidir enviar.
  const { data: siteConfigs, error: siteConfigsError } = await supabase
    .from("site_configs")
    .select("id, competitor_id, version, confidence_score, selectors, created_at, cards_found")
    .in("competitor_id", competitorIds)
    .eq("status", "pendente_revisao")
    .or("version.gt.1,sent_to_superadmin_at.not.is.null")
    .order("created_at", { ascending: false });
  if (siteConfigsError) throw new Error(`Falha ao buscar configs pendentes: ${siteConfigsError.message}`);

  return (siteConfigs ?? []).map((sc) => {
    const selectors = sc.selectors as { strategy: "html_css" | "json_api"; warnings?: string[]; total_listings_hint?: number | null };
    return {
      id: sc.id,
      competitorId: sc.competitor_id,
      competitorName: competitorNameById.get(sc.competitor_id) ?? "Concorrente removido",
      version: sc.version,
      strategy: selectors.strategy,
      confidenceScore: sc.confidence_score,
      warnings: selectors.warnings ?? [],
      createdAt: sc.created_at,
      cardsFound: sc.cards_found,
      totalListingsHint: selectors.total_listings_hint ?? null,
    };
  });
}

// Versão leve só de contagem — usada pelo badge de "Configurações" na nav
// (layout.tsx -> AccountShellChrome -> AccountSidebar), que roda em toda
// página escopada à conta e não precisa dos detalhes completos que
// getPendingSiteConfigs traz. Mesmo filtro version/sent_to_superadmin_at.
export async function getPendingSiteConfigCount(accountId: string): Promise<number> {
  const supabase = await createClient();

  const { data: competitors, error: competitorsError } = await supabase.from("competitors").select("id").eq("account_id", accountId);
  if (competitorsError) throw new Error(`Falha ao buscar concorrentes: ${competitorsError.message}`);
  const competitorIds = (competitors ?? []).map((c) => c.id);
  if (competitorIds.length === 0) return 0;

  const { count, error } = await supabase
    .from("site_configs")
    .select("id", { count: "exact", head: true })
    .in("competitor_id", competitorIds)
    .eq("status", "pendente_revisao")
    .or("version.gt.1,sent_to_superadmin_at.not.is.null");
  if (error) throw new Error(`Falha ao contar configs pendentes: ${error.message}`);
  return count ?? 0;
}
