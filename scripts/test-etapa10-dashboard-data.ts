import { createServiceClient } from "../packages/scraper/core/db.js";
import { colorForCompetitor } from "../apps/web/lib/categorical-colors.js";

// Reproduz a lógica de apps/web/app/(dashboard)/admin/get-dashboard-data.ts
// usando o cliente service-role — confirma que a query com `abbreviation`
// (migration 0005, aplicada agora) funciona contra dados reais, e que o
// breakdown por concorrente/janela + a cor determinística batem certo.

const DEMO_ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";
const supabase = createServiceClient();

const { data: competitors, error: competitorsError } = await supabase
  .from("competitors")
  .select("id, name, abbreviation, status")
  .eq("account_id", DEMO_ACCOUNT_ID);
if (competitorsError) throw competitorsError;
console.log("=== Concorrentes ===");
console.log(competitors?.map((c) => `${c.name} → abbreviation="${c.abbreviation}", status=${c.status}, cor=${colorForCompetitor(c.id)}`));

const competitorMeta = new Map((competitors ?? []).map((c) => [c.id, { name: c.name, abbreviation: c.abbreviation }]));
const competitorIds = (competitors ?? []).map((c) => c.id);

const { data: properties, error: propertiesError } = await supabase
  .from("properties")
  .select("id, external_id, competitor_id")
  .in("competitor_id", competitorIds);
if (propertiesError) throw propertiesError;

const propertyById = new Map((properties ?? []).map((p) => [p.id, p]));
const propertyIds = (properties ?? []).map((p) => p.id);

const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const { data: changes, error: changesError } = await supabase
  .from("property_changes")
  .select("id, property_id, old_price, new_price, old_status, new_status, detected_at")
  .in("property_id", propertyIds)
  .gte("detected_at", sinceIso)
  .order("detected_at", { ascending: false });
if (changesError) throw changesError;
console.log("\nchanges (7d):", changes?.length);

const now = Date.now();
const countsByWindow = { "1h": new Map<string, number>(), "24h": new Map<string, number>(), "7d": new Map<string, number>() };

for (const change of changes ?? []) {
  const ageMs = now - new Date(change.detected_at).getTime();
  const isWithin1h = ageMs <= 3_600_000;
  const isWithin24h = ageMs <= 86_400_000;
  const property = propertyById.get(change.property_id);
  if (!property) continue;
  const cid = property.competitor_id;
  countsByWindow["7d"].set(cid, (countsByWindow["7d"].get(cid) ?? 0) + 1);
  if (isWithin24h) countsByWindow["24h"].set(cid, (countsByWindow["24h"].get(cid) ?? 0) + 1);
  if (isWithin1h) countsByWindow["1h"].set(cid, (countsByWindow["1h"].get(cid) ?? 0) + 1);
}

function printBreakdown(label: string, counts: Map<string, number>) {
  const entries = [...counts.entries()].map(([cid, count]) => ({
    abbreviation: competitorMeta.get(cid)?.abbreviation,
    name: competitorMeta.get(cid)?.name,
    color: colorForCompetitor(cid),
    count,
  }));
  console.log(`\n=== Breakdown ${label} ===`);
  console.log(entries.length === 0 ? "(vazio)" : entries);
}

printBreakdown("1h", countsByWindow["1h"]);
printBreakdown("24h", countsByWindow["24h"]);
printBreakdown("7d", countsByWindow["7d"]);

console.log("\n=== Consistência da cor (mesmo competitor_id, 3 chamadas) ===");
const sampleId = competitors?.[0]?.id;
if (sampleId) {
  const c1 = colorForCompetitor(sampleId);
  const c2 = colorForCompetitor(sampleId);
  const c3 = colorForCompetitor(sampleId);
  console.log({ c1, c2, c3 }, c1 === c2 && c2 === c3 ? "✅ determinístico" : "❌ inconsistente");
}
