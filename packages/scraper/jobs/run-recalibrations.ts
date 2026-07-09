import { createServiceClient } from "../core/db.js";
import { recalibrateSiteConfig, type RecalibrateResult } from "./recalibrate-site-config.js";

// Mesmo padrão de fila simples do run-due-checks.ts (Etapa 5) — concorrência
// limitada, sem Redis/BullMQ.
const CONCURRENCY = 3;

export interface RunRecalibrationsResult {
  competitorsProcessed: number;
  results: RecalibrateResult[];
  errors: { competitorId: string; message: string }[];
}

async function getDegradedCompetitorIds(): Promise<string[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("site_configs").select("competitor_id").eq("status", "degradado");
  if (error) throw new Error(`Falha ao buscar site_configs degradados: ${error.message}`);
  return [...new Set((data ?? []).map((row) => row.competitor_id as string))];
}

// Etapa 7: varre todo site_config com status = 'degradado' (marcado por
// check-competitor.ts quando uma extração completa captura 0 imóveis ou a
// maioria sem preço) e recalibra um por um.
export async function runRecalibrations(): Promise<RunRecalibrationsResult> {
  const competitorIds = await getDegradedCompetitorIds();
  const results: RecalibrateResult[] = [];
  const errors: { competitorId: string; message: string }[] = [];

  for (let i = 0; i < competitorIds.length; i += CONCURRENCY) {
    const batch = competitorIds.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(batch.map((id) => recalibrateSiteConfig(id)));

    settled.forEach((outcome, idx) => {
      if (outcome.status === "fulfilled") {
        results.push(outcome.value);
      } else {
        errors.push({
          competitorId: batch[idx],
          message: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
        });
      }
    });
  }

  return { competitorsProcessed: competitorIds.length, results, errors };
}
