import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractedProperty } from "../core/types.js";

interface PropertyRow {
  id: string;
  external_id: string;
  current_price: number | null;
  price_status: "valor" | "sob_consulta";
  status: "ativo" | "possivelmente_vendido";
}

interface PropertyChangeInsert {
  property_id: string;
  old_price: number | null;
  new_price: number | null;
  old_status: string | null;
  new_status: string | null;
}

// Etapa 6: persiste o resultado de uma captura (Etapa 4/5) em `properties` e
// gera `property_changes` quando algo relevante mudou. "Comparação com
// cache" quer dizer literalmente isso — compara contra o que já está salvo,
// não recalcula nada a partir do zero.
//
// Duas dimensões de mudança, cada uma pode gerar sua própria linha em
// property_changes (não são mutuamente exclusivas, mas raramente ocorrem
// juntas na prática):
//   1. Preço/price_status mudou num imóvel já conhecido (old_price/new_price
//      preenchidos, old_status/new_status = null).
//   2. Disponibilidade mudou — imóvel sumiu da listagem (ativo →
//      possivelmente_vendido) ou reapareceu (possivelmente_vendido → ativo)
//      (old_status/new_status preenchidos, old_price/new_price = preço
//      atual, sem mudança).
//
// Decisão de escopo (2026-07-10): imóvel novo (external_id nunca visto
// antes) só é inserido em `properties` — NÃO gera property_changes. O
// schema até permitiria (old_price nullable), mas "comparação com cache"
// pressupõe uma entrada anterior pra comparar; sem isso não há mudança,
// só uma captura nova. Registrado no README para poder ser revisto.
export async function persistAndDetectChanges(
  supabase: SupabaseClient,
  competitorId: string,
  capturedProperties: ExtractedProperty[],
  options: { stoppedEarlyDueToError: boolean }
): Promise<{ changesDetected: number }> {
  const { data: existingRows, error: fetchError } = await supabase
    .from("properties")
    .select("id, external_id, current_price, price_status, status")
    .eq("competitor_id", competitorId);

  if (fetchError) throw new Error(`Falha ao buscar properties existentes: ${fetchError.message}`);

  const existingByExternalId = new Map<string, PropertyRow>(
    ((existingRows ?? []) as PropertyRow[]).map((row) => [row.external_id, row])
  );
  const capturedExternalIds = new Set(capturedProperties.map((p) => p.external_id));
  const now = new Date().toISOString();

  const changes: PropertyChangeInsert[] = [];
  const toInsert: Array<{
    competitor_id: string;
    external_id: string;
    current_price: number | null;
    price_status: "valor" | "sob_consulta";
    url: string;
    status: "ativo";
    last_seen_at: string;
  }> = [];

  for (const captured of capturedProperties) {
    const existing = existingByExternalId.get(captured.external_id);

    if (!existing) {
      toInsert.push({
        competitor_id: competitorId,
        external_id: captured.external_id,
        current_price: captured.price,
        price_status: captured.price_status,
        url: captured.url,
        status: "ativo",
        last_seen_at: now,
      });
      continue;
    }

    const priceChanged = existing.current_price !== captured.price || existing.price_status !== captured.price_status;
    const reappeared = existing.status === "possivelmente_vendido";

    const { error: updateError } = await supabase
      .from("properties")
      .update({
        current_price: captured.price,
        price_status: captured.price_status,
        url: captured.url,
        last_seen_at: now,
        status: "ativo",
      })
      .eq("id", existing.id);
    if (updateError) throw new Error(`Falha ao atualizar property ${existing.id}: ${updateError.message}`);

    if (priceChanged) {
      changes.push({
        property_id: existing.id,
        old_price: existing.current_price,
        new_price: captured.price,
        old_status: null,
        new_status: null,
      });
    }
    if (reappeared) {
      changes.push({
        property_id: existing.id,
        old_price: existing.current_price,
        new_price: existing.current_price,
        old_status: "possivelmente_vendido",
        new_status: "ativo",
      });
    }
  }

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase.from("properties").insert(toInsert);
    if (insertError) throw new Error(`Falha ao inserir novas properties: ${insertError.message}`);
  }

  // "Sumiu = possivelmente vendido" só vale para execuções completas — ver
  // README, contrato definido antes da Etapa 5: uma captura parcial não
  // pode ser lida como "esses imóveis não estão mais no site".
  if (!options.stoppedEarlyDueToError) {
    for (const existing of existingByExternalId.values()) {
      if (existing.status === "ativo" && !capturedExternalIds.has(existing.external_id)) {
        const { error: updateError } = await supabase
          .from("properties")
          .update({ status: "possivelmente_vendido" })
          .eq("id", existing.id);
        if (updateError) throw new Error(`Falha ao marcar property ${existing.id} como possivelmente_vendido: ${updateError.message}`);

        changes.push({
          property_id: existing.id,
          old_price: existing.current_price,
          new_price: existing.current_price,
          old_status: "ativo",
          new_status: "possivelmente_vendido",
        });
      }
    }
  }

  if (changes.length > 0) {
    const { error: changesError } = await supabase.from("property_changes").insert(changes);
    if (changesError) throw new Error(`Falha ao gravar property_changes: ${changesError.message}`);
  }

  return { changesDetected: changes.length };
}
