import { createServiceClient } from "../packages/scraper/core/db.js";
import { persistAndDetectChanges } from "../packages/scraper/jobs/persist-and-compare.js";
import type { ExtractedProperty } from "../packages/scraper/core/types.js";

// Validação isolada e determinística de persist-and-compare.ts — chama a
// função diretamente com dados sintéticos (sem depender de scraping real),
// pra provar cada caminho de decisão sem tocar nos dados reais do Muller
// Imóveis usados no teste manual do usuário.
//
// scraperRunId: null em todas as chamadas — este teste valida a lógica de
// detecção de mudanças isoladamente, não a linkagem com scraper_runs (que
// não existe aqui, só em check-competitor.ts). A coluna aceita null.

const DEMO_ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";
const supabase = createServiceClient();

const { data: competitor, error } = await supabase
  .from("competitors")
  .insert({
    account_id: DEMO_ACCOUNT_ID,
    name: "Teste Etapa 6 (persist-and-compare)",
    abbreviation: "TST",
    listing_url: "https://exemplo-invalido.teste/nao-existe",
    polling_interval_minutes: 5,
    status: "ativo",
  })
  .select("id")
  .single();
if (error || !competitor) throw new Error(`Falha ao criar competitor: ${error?.message}`);
const competitorId = competitor.id;
console.log("competitor_id:", competitorId);

function prop(external_id: string, price: number | null): ExtractedProperty {
  return { external_id, price, price_status: price === null ? "sob_consulta" : "valor", url: `https://exemplo.teste/${external_id}` };
}

async function propsState() {
  const { data } = await supabase
    .from("properties")
    .select("external_id, current_price, status")
    .eq("competitor_id", competitorId)
    .order("external_id");
  return data;
}

function check(label: string, ok: boolean) {
  console.log(`${label}: ${ok ? "OK" : "FALHOU"}`);
}

console.log("\n=== Passo 1: primeira captura (A=100, B=200) — tudo novo, 2 mudanças esperadas (added × 2) ===");
let r = await persistAndDetectChanges(supabase, competitorId, [prop("A", 100), prop("B", 200)], {
  stoppedEarlyDueToError: false,
  configLooksDegraded: false,
  scraperRunId: null,
});
check("changesDetected === 2", r.changesDetected === 2);
check("os dois são change_type='added'", r.changes.every((c) => c.changeType === "added"));
console.log(await propsState());

console.log("\n=== Passo 2: A muda de preço (100 -> 150), B igual — 1 mudança esperada (price) ===");
r = await persistAndDetectChanges(supabase, competitorId, [prop("A", 150), prop("B", 200)], {
  stoppedEarlyDueToError: false,
  configLooksDegraded: false,
  scraperRunId: null,
});
check("changesDetected === 1", r.changesDetected === 1);
check("change_type === 'price'", r.changes[0]?.changeType === "price");

console.log("\n=== Passo 3: B some da captura, execução COMPLETA — 1 mudança esperada (removed) ===");
r = await persistAndDetectChanges(supabase, competitorId, [prop("A", 150)], {
  stoppedEarlyDueToError: false,
  configLooksDegraded: false,
  scraperRunId: null,
});
check("changesDetected === 1", r.changesDetected === 1);
check("change_type === 'removed'", r.changes[0]?.changeType === "removed");
console.log(await propsState());

console.log("\n=== Passo 4: B continua ausente, execução PARCIAL (stoppedEarlyDueToError=true) — 0 mudanças esperadas (removed bloqueado) ===");
r = await persistAndDetectChanges(supabase, competitorId, [prop("A", 150)], {
  stoppedEarlyDueToError: true,
  configLooksDegraded: false,
  scraperRunId: null,
});
check("changesDetected === 0", r.changesDetected === 0);
console.log(await propsState());

console.log("\n=== Passo 5: B reaparece — 1 mudança esperada (reappeared) ===");
r = await persistAndDetectChanges(supabase, competitorId, [prop("A", 150), prop("B", 200)], {
  stoppedEarlyDueToError: false,
  configLooksDegraded: false,
  scraperRunId: null,
});
check("changesDetected === 1", r.changesDetected === 1);
check("change_type === 'reappeared'", r.changes[0]?.changeType === "reappeared");
console.log(await propsState());

console.log("\n=== Passo 6: imóvel novo C aparece, config DEGRADADO — 0 mudanças esperadas (added bloqueado por dado suspeito) ===");
r = await persistAndDetectChanges(supabase, competitorId, [prop("A", 150), prop("B", 200), prop("C", 300)], {
  stoppedEarlyDueToError: false,
  configLooksDegraded: true,
  scraperRunId: null,
});
check("changesDetected === 0", r.changesDetected === 0);
console.log(await propsState());
console.log("(C foi salvo em properties mesmo assim — só o evento 'added' ficou bloqueado, dado bruto continua persistido)");

console.log("\n=== Passo 7: imóvel novo D aparece (external_id diferente de C, que já foi persistido no Passo 6), execução PARCIAL por falha de rede (mas config NÃO degradado) — 1 mudança esperada (added permitido) ===");
r = await persistAndDetectChanges(supabase, competitorId, [prop("A", 150), prop("B", 200), prop("C", 300), prop("D", 400)], {
  stoppedEarlyDueToError: true,
  configLooksDegraded: false,
  scraperRunId: null,
});
check("changesDetected === 1", r.changesDetected === 1);
check("change_type === 'added' (presença é confiável mesmo com falha de rede)", r.changes[0]?.changeType === "added");
console.log(await propsState());

console.log("\n=== property_changes gravados (ordem cronológica) ===");
const { data: propRows } = await supabase.from("properties").select("id, external_id").eq("competitor_id", competitorId);
const propIds = (propRows ?? []).map((p) => p.id);
const { data: changes } = await supabase
  .from("property_changes")
  .select("property_id, change_type, old_price, new_price, old_status, new_status, detected_at")
  .in("property_id", propIds)
  .order("detected_at", { ascending: true });
console.log(JSON.stringify(changes, null, 2));

console.log("\n=== Limpeza ===");
await supabase.from("competitors").delete().eq("id", competitorId);
console.log("Removido (cascade apaga properties + property_changes).");
