import { runDueChecks } from "scraper/jobs/run-due-checks";
import { sendDailyDigest } from "scraper/jobs/send-daily-digest";

// Worker persistente (Railway) — decisão do usuário depois de avaliar
// Vercel Cron: uma checagem grande (Sentineli & Sobral, ~118 páginas) já
// leva ~4min sozinha, e o teto de duração de uma function serverless
// (mesmo no plano Pro, ~300s) fica perto demais disso hoje, antes de
// qualquer crescimento de carteira de clientes. Um processo contínuo não
// tem esse teto — cada checagem roda o tempo que precisar.
//
// Mesmo padrão que packages/scraper/jobs/scheduler.ts já pressupõe
// (getDueCompetitors + polling_interval_minutes por concorrente) — só
// faltava algo chamando isso de verdade, em loop, o que nunca existiu
// neste projeto (nem Vercel Cron, nem nenhum outro disparo automático).

const CHECK_INTERVAL_MS = Number(process.env.WORKER_CHECK_INTERVAL_MS ?? 60_000);
const DIGEST_HOUR_UTC = Number(process.env.DAILY_DIGEST_HOUR_UTC ?? 23);

let lastDigestDateSent: string | null = null;

function log(message: string): void {
  console.log(`[worker ${new Date().toISOString()}] ${message}`);
}

async function runChecksTick(): Promise<void> {
  try {
    const result = await runDueChecks();
    if (result.competitorsProcessed > 0) {
      log(`checagens: ${result.competitorsProcessed} concorrente(s) processado(s), ${result.errors.length} erro(s)`);
      for (const error of result.errors) {
        log(`  erro no concorrente ${error.competitorId}: ${error.message}`);
      }
    }
  } catch (err) {
    log(`erro inesperado no ciclo de checagens: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Guard em memória (lastDigestDateSent) evita chamar sendDailyDigest() mais
// de uma vez por processo no mesmo dia — mas o guard de verdade, durável
// contra um restart do worker, é a checagem em email_digest_log dentro do
// próprio sendDailyDigest() (ver packages/scraper/jobs/send-daily-digest.ts).
async function maybeSendDigest(): Promise<void> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (now.getUTCHours() !== DIGEST_HOUR_UTC || lastDigestDateSent === today) return;

  try {
    const result = await sendDailyDigest(today);
    log(`resumo diário: ${JSON.stringify(result)}`);
    lastDigestDateSent = today;
  } catch (err) {
    log(`erro inesperado no resumo diário: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// setTimeout recursivo, não setInterval — uma checagem grande pode levar
// minutos; setInterval deixaria o próximo tick começar ANTES do anterior
// terminar (checagens sobrepostas no mesmo concorrente). Aqui o próximo
// ciclo só começa CHECK_INTERVAL_MS depois que o atual terminou de verdade.
async function loop(): Promise<void> {
  await runChecksTick();
  await maybeSendDigest();
  setTimeout(loop, CHECK_INTERVAL_MS);
}

log(`iniciado — checagens a cada ${CHECK_INTERVAL_MS / 1000}s, resumo diário às ${DIGEST_HOUR_UTC}h UTC`);
void loop();
