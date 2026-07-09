import { createServiceClient } from "../packages/scraper/core/db.js";

// Reproduz get-report-data.ts com o cliente service-role — confirma que a
// query (com abbreviation, filtros de data/tipo/status, e o caminho
// direction/minVariation em JS) funciona contra dados reais do Muller.

const DEMO_ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";
const supabase = createServiceClient();

const { data: competitors } = await supabase.from("competitors").select("id, name, abbreviation").eq("account_id", DEMO_ACCOUNT_ID);
console.log("competitors:", competitors);

const competitorIds = (competitors ?? []).map((c) => c.id);
const { data: properties } = await supabase.from("properties").select("id, external_id, competitor_id, status").in("competitor_id", competitorIds);
console.log("properties:", properties?.length);

const propertyIds = (properties ?? []).map((p) => p.id);

console.log("\n=== Sem filtro de direção/variação (caminho paginado no banco) ===");
const { data: changesA, count } = await supabase
  .from("property_changes")
  .select("id, property_id, old_price, new_price, old_status, new_status, detected_at", { count: "exact" })
  .in("property_id", propertyIds)
  .gte("detected_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
  .order("detected_at", { ascending: false })
  .range(0, 49);
console.log("total (count exact):", count, "linhas retornadas:", changesA?.length);

console.log("\n=== Só tipo 'preço' (new_status is null) ===");
const { data: changesPreco } = await supabase
  .from("property_changes")
  .select("id, old_price, new_price, new_status")
  .in("property_id", propertyIds)
  .is("new_status", null);
console.log("mudanças de preço:", changesPreco?.length, changesPreco);

console.log("\n=== Só tipo 'disponibilidade' (new_status not null) ===");
const { data: changesDisp } = await supabase
  .from("property_changes")
  .select("id, old_status, new_status")
  .in("property_id", propertyIds)
  .not("new_status", "is", null);
console.log("mudanças de disponibilidade:", changesDisp?.length, changesDisp);

console.log("\n=== Filtro de status do imóvel (ativo) ===");
const { data: activeProps } = await supabase.from("properties").select("id").in("competitor_id", competitorIds).eq("status", "ativo");
console.log("properties ativas:", activeProps?.length, "de", properties?.length, "total");

console.log("\n=== Busca por referência ('1006') ===");
const { data: searchResult } = await supabase.from("properties").select("id, external_id").in("competitor_id", competitorIds).ilike("external_id", "%1006%");
console.log("resultado da busca:", searchResult);
