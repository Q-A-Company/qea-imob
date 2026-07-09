import { getDueCompetitors } from "./scheduler.js";
import { checkCompetitor, type CheckCompetitorResult } from "./check-competitor.js";

// "Fila" simples com concorrência limitada, sem Redis/BullMQ — a spec
// original permite explicitamente essa alternativa mais simples pra
// começar. Cada tick do scheduler chama isto uma vez: busca quem está
// devido e processa em lotes de CONCURRENCY por vez, sem deixar um
// concorrente lento/travado bloquear os outros indefinidamente (timeout já
// existe em fetch-html.ts/json-api-extractor.ts por baixo).
const CONCURRENCY = 3;

export interface RunDueChecksResult {
  competitorsProcessed: number;
  results: CheckCompetitorResult[];
  errors: { competitorId: string; message: string }[];
}

export async function runDueChecks(): Promise<RunDueChecksResult> {
  const due = await getDueCompetitors();
  const results: CheckCompetitorResult[] = [];
  const errors: { competitorId: string; message: string }[] = [];

  for (let i = 0; i < due.length; i += CONCURRENCY) {
    const batch = due.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(batch.map((c) => checkCompetitor(c.id)));

    settled.forEach((outcome, idx) => {
      if (outcome.status === "fulfilled") {
        results.push(outcome.value);
      } else {
        errors.push({
          competitorId: batch[idx].id,
          message: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
        });
      }
    });
  }

  return { competitorsProcessed: due.length, results, errors };
}
