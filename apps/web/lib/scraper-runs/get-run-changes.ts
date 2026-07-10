import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PropertyChangeType } from "@/lib/supabase/types";

export interface RunChangeDetail {
  id: string;
  externalId: string;
  changeType: PropertyChangeType;
  oldPrice: number | null;
  newPrice: number | null;
  oldStatus: string | null;
  newStatus: string | null;
  detectedAt: string;
}

// Compartilhado entre Histórico (admin/history) e Relatório de Erros
// (superadmin/.../errors) — os dois mostram, ao expandir uma linha de
// scraper_run, exatamente quais property_changes ela gerou (migration 0016,
// scraper_run_id). Sem .in("property_id", ...) tipo get-report-data.ts:
// aqui já filtramos direto por scraper_run_id, e a lista de runIds de UMA
// página (20-30) nunca chega perto do limite de URL que quebrou com listas
// de milhares de properties.
export async function getRunChangesByRunId(runIds: string[]): Promise<Map<string, RunChangeDetail[]>> {
  const result = new Map<string, RunChangeDetail[]>();
  if (runIds.length === 0) return result;

  const supabase = await createClient();

  const { data: changes, error: changesError } = await supabase
    .from("property_changes")
    .select("id, property_id, scraper_run_id, change_type, old_price, new_price, old_status, new_status, detected_at")
    .in("scraper_run_id", runIds)
    .order("detected_at", { ascending: true });
  if (changesError) throw new Error(`Falha ao buscar mudanças da execução: ${changesError.message}`);
  if (!changes || changes.length === 0) return result;

  const propertyIds = [...new Set(changes.map((c) => c.property_id))];
  const { data: properties, error: propertiesError } = await supabase
    .from("properties")
    .select("id, external_id")
    .in("id", propertyIds);
  if (propertiesError) throw new Error(`Falha ao buscar imóveis das mudanças: ${propertiesError.message}`);

  const externalIdByPropertyId = new Map((properties ?? []).map((p) => [p.id, p.external_id]));

  for (const change of changes) {
    if (!change.scraper_run_id) continue;
    const detail: RunChangeDetail = {
      id: change.id,
      externalId: externalIdByPropertyId.get(change.property_id) ?? "imóvel removido",
      changeType: change.change_type,
      oldPrice: change.old_price,
      newPrice: change.new_price,
      oldStatus: change.old_status,
      newStatus: change.new_status,
      detectedAt: change.detected_at,
    };
    const existing = result.get(change.scraper_run_id);
    if (existing) existing.push(detail);
    else result.set(change.scraper_run_id, [detail]);
  }

  return result;
}
