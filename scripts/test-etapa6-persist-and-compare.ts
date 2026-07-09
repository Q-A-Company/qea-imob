import { createServiceClient } from "../packages/scraper/core/db.js";
import { persistAndDetectChanges } from "../packages/scraper/jobs/persist-and-compare.js";
import type { ExtractedProperty } from "../packages/scraper/core/types.js";

// Validação isolada e determinística de persist-and-compare.ts — chama a
// função diretamente com dados sintéticos (sem depender de scraping real),
// pra provar cada caminho de decisão sem tocar nos dados reais do Muller
// Imóveis usados no teste manual do usuário.

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

console.log("\n=== Passo 1: primeira captura (A=100, B=200) — tudo novo, 0 mudanças esperadas ===");
let r = await persistAndDetectChanges(supabase, competitorId, [prop("A", 100), prop("B", 200)], { stoppedEarlyDueToError: false });
console.log("changesDetected:", r.changesDetected, r.changesDetected === 0 ? "OK" : "FALHOU");
console.log(await propsState());

console.log("\n=== Passo 2: A muda de preço (100 -> 150), B igual — 1 mudança esperada (price) ===");
r = await persistAndDetectChanges(supabase, competitorId, [prop("A", 150), prop("B", 200)], { stoppedEarlyDueToError: false });
console.log("changesDetected:", r.changesDetected, r.changesDetected === 1 ? "OK" : "FALHOU");

console.log("\n=== Passo 3: B some da captura, execução COMPLETA — 1 mudança esperada (ativo->possivelmente_vendido) ===");
r = await persistAndDetectChanges(supabase, competitorId, [prop("A", 150)], { stoppedEarlyDueToError: false });
console.log("changesDetected:", r.changesDetected, r.changesDetected === 1 ? "OK" : "FALHOU");
console.log(await propsState());

console.log("\n=== Passo 4: B continua ausente, mas execução PARCIAL (stoppedEarlyDueToError=true) — 0 mudanças esperadas (B não deve ser tocado) ===");
r = await persistAndDetectChanges(supabase, competitorId, [prop("A", 150)], { stoppedEarlyDueToError: true });
console.log("changesDetected:", r.changesDetected, r.changesDetected === 0 ? "OK" : "FALHOU");
console.log(await propsState());

console.log("\n=== Passo 5: B reaparece — 1 mudança esperada (possivelmente_vendido->ativo) ===");
r = await persistAndDetectChanges(supabase, competitorId, [prop("A", 150), prop("B", 200)], { stoppedEarlyDueToError: false });
console.log("changesDetected:", r.changesDetected, r.changesDetected === 1 ? "OK" : "FALHOU");
console.log(await propsState());

console.log("\n=== property_changes gravados (ordem cronológica) ===");
const { data: propRows } = await supabase.from("properties").select("id, external_id").eq("competitor_id", competitorId);
const propIds = (propRows ?? []).map((p) => p.id);
const { data: changes } = await supabase
  .from("property_changes")
  .select("property_id, old_price, new_price, old_status, new_status, detected_at")
  .in("property_id", propIds)
  .order("detected_at", { ascending: true });
console.log(JSON.stringify(changes, null, 2));

console.log("\n=== Limpeza ===");
await supabase.from("competitors").delete().eq("id", competitorId);
console.log("Removido (cascade apaga properties + property_changes).");
