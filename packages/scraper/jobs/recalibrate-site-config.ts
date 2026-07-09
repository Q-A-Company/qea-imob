import { createServiceClient, type ScraperRunInsert } from "../core/db.js";
import { learnSiteConfig } from "./learn-site-config.js";
import { checkExternalIdCompatibility } from "../ai/site-config-compatibility.js";
import { createNotification } from "../core/notify.js";

export interface RecalibrateResult {
  competitorId: string;
  newSiteConfigId: string;
  newVersion: number;
  activated: boolean; // true = status 'ativo' direto; false = 'pendente_revisao'
  reasons: string[]; // motivos de incompatibilidade/rejeição, vazio se activated
}

async function recordRun(supabase: ReturnType<typeof createServiceClient>, run: ScraperRunInsert): Promise<void> {
  const { error } = await supabase.from("scraper_runs").insert(run);
  if (error) throw new Error(`Falha ao gravar scraper_runs: ${error.message}`);
}

// Etapa 7: recalibra o site_config de UM concorrente já marcado como
// 'degradado' (ver gatilho em check-competitor.ts). Reaprende via IA
// (Etapa 3) do zero e decide se pode ativar sozinho ou se precisa de
// aprovação humana (SuperAdmin, Etapa 12), seguindo o contrato definido
// em ai/site-config-compatibility.ts: só ativa automaticamente quando o
// novo external_id é estruturalmente compatível com o config anterior E
// passa na checagem de sanidade — caso contrário, salva como
// 'pendente_revisao' e NÃO mexe no config anterior (que fica sem nenhum
// site_config 'ativo' até alguém revisar; checkCompetitor trata isso como
// "nenhum site_config ativo", não tenta checar com um config degradado).
//
// stopped_early_due_to_error (falha de rede) NUNCA chega até aqui — quem
// decide marcar 'degradado' já filtra isso (ver check-competitor.ts); esta
// função só roda para configs que capturaram uma extração completa mas de
// baixa qualidade (0 imóveis ou maioria sem preço).
export async function recalibrateSiteConfig(competitorId: string): Promise<RecalibrateResult> {
  const supabase = createServiceClient();

  const { data: competitor, error: competitorError } = await supabase
    .from("competitors")
    .select("id, account_id, name, listing_url")
    .eq("id", competitorId)
    .single();
  if (competitorError || !competitor) {
    throw new Error(`Concorrente ${competitorId} não encontrado: ${competitorError?.message ?? "sem dados"}`);
  }

  const { data: previous, error: previousError } = await supabase
    .from("site_configs")
    .select("id, selectors, version")
    .eq("competitor_id", competitorId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousError) throw new Error(`Falha ao buscar site_config anterior: ${previousError.message}`);
  if (!previous) {
    throw new Error(`Concorrente ${competitorId} não tem nenhum site_config anterior — recalibração pressupõe um config existente para comparar.`);
  }

  const learned = await learnSiteConfig(competitor.listing_url);
  const compatibility = checkExternalIdCompatibility({ previous: previous.selectors, next: learned.selectors });
  const activated = compatibility.compatible && learned.externalIdSanityOk;
  const newVersion = previous.version + 1;

  const { data: newSiteConfig, error: insertError } = await supabase
    .from("site_configs")
    .insert({
      competitor_id: competitorId,
      selectors: learned.selectors,
      version: newVersion,
      confidence_score: learned.selectors.confidence_score,
      status: activated ? "ativo" : "pendente_revisao",
      last_validated_at: activated ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (insertError || !newSiteConfig) throw new Error(`Falha ao gravar novo site_config: ${insertError?.message}`);

  await recordRun(supabase, {
    competitor_id: competitorId,
    run_type: "recalibracao",
    success: true,
    properties_captured: learned.stats.cardsFound,
    changes_detected: 0,
    error_message: activated ? null : `pendente_revisao: ${compatibility.reasons.join("; ")}`,
    stopped_early_due_to_error: false,
  });

  await createNotification(supabase, {
    accountId: competitor.account_id,
    title: activated
      ? `Concorrente recalibrado: ${competitor.name}`
      : `Recalibração pendente de revisão: ${competitor.name}`,
    message: activated
      ? `"${competitor.name}" foi recalibrado automaticamente (v${newVersion}) após o config anterior degradar. As checagens de preço voltaram a rodar normalmente.`
      : `A recalibração automática de "${competitor.name}" (v${newVersion}) gerou um config estruturalmente diferente do anterior — risco de quebrar o histórico de preços. Nenhum config foi ativado; um SuperAdmin precisa revisar e aprovar manualmente. Motivo: ${compatibility.reasons.join("; ")}`,
  });

  return {
    competitorId,
    newSiteConfigId: newSiteConfig.id,
    newVersion,
    activated,
    reasons: compatibility.reasons,
  };
}
