import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractedProperty } from "../core/types.js";

interface PropertyRow {
  id: string;
  external_id: string;
  current_price: number | null;
  price_status: "valor" | "sob_consulta";
  status: "ativo" | "possivelmente_vendido";
}

export interface DetectedChange {
  propertyChangeId: string;
  externalId: string;
  oldPrice: number | null;
  newPrice: number | null;
  oldStatus: string | null;
  newStatus: string | null;
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
const FETCH_PAGE_SIZE = 1000;

// O PostgREST devolve no máximo ~1000 linhas por resposta por padrão,
// silenciosamente — sem erro, sem aviso, só corta. Um .select() sem
// paginação explícita parece "buscar tudo" mas não busca, a partir de mil
// linhas. Reproduzido contra dados reais (Sentineli & Sobral, 1409
// properties): a query "buscar todas as properties existentes" devolvia só
// 1000 de 1408 — o mapa de "isso já existe?" ficava incompleto, imóveis
// reais eram tratados como novos, e o INSERT batia na constraint única
// (competitor_id, external_id) na segunda checagem em diante. Não
// acontecia com concorrentes pequenos (Muller, 61 properties) por nunca
// cruzar o limite. Paginação explícita aqui é a correção da causa raiz —
// não é otimização prematura, é a diferença entre "buscar tudo" de
// verdade ou não.
async function fetchAllExistingProperties(supabase: SupabaseClient, competitorId: string): Promise<PropertyRow[]> {
  const all: PropertyRow[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("properties")
      .select("id, external_id, current_price, price_status, status")
      .eq("competitor_id", competitorId)
      .range(offset, offset + FETCH_PAGE_SIZE - 1);
    if (error) throw new Error(`Falha ao buscar properties existentes: ${error.message}`);
    all.push(...((data ?? []) as PropertyRow[]));
    if (!data || data.length < FETCH_PAGE_SIZE) break;
    offset += FETCH_PAGE_SIZE;
  }
  return all;
}

export async function persistAndDetectChanges(
  supabase: SupabaseClient,
  competitorId: string,
  capturedProperties: ExtractedProperty[],
  options: { stoppedEarlyDueToError: boolean }
): Promise<{ changesDetected: number; changes: DetectedChange[] }> {
  const existingRows = await fetchAllExistingProperties(supabase, competitorId);

  const existingByExternalId = new Map<string, PropertyRow>(existingRows.map((row) => [row.external_id, row]));
  const capturedExternalIds = new Set(capturedProperties.map((p) => p.external_id));
  const now = new Date().toISOString();

  // Insere cada property_change individualmente (não em lote) — o retorno
  // de um INSERT em lote via PostgREST não garante preservar a ordem do
  // array enviado, e isso seria necessário pra casar cada linha inserida
  // com o external_id certo (ver DetectedChange). Volume por checagem é
  // pequeno (poucas mudanças por vez), então N inserts pequenos é uma troca
  // segura por correção, não uma otimização prematura sendo descartada.
  async function insertChange(change: {
    property_id: string;
    old_price: number | null;
    new_price: number | null;
    old_status: string | null;
    new_status: string | null;
  }, externalId: string): Promise<DetectedChange> {
    const { data, error } = await supabase.from("property_changes").insert(change).select("id").single();
    if (error || !data) throw new Error(`Falha ao gravar property_change: ${error?.message}`);
    return {
      propertyChangeId: data.id,
      externalId,
      oldPrice: change.old_price,
      newPrice: change.new_price,
      oldStatus: change.old_status,
      newStatus: change.new_status,
    };
  }

  const detectedChanges: DetectedChange[] = [];
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
      detectedChanges.push(
        await insertChange(
          { property_id: existing.id, old_price: existing.current_price, new_price: captured.price, old_status: null, new_status: null },
          existing.external_id
        )
      );
    }
    if (reappeared) {
      detectedChanges.push(
        await insertChange(
          {
            property_id: existing.id,
            old_price: existing.current_price,
            new_price: existing.current_price,
            old_status: "possivelmente_vendido",
            new_status: "ativo",
          },
          existing.external_id
        )
      );
    }
  }

  if (toInsert.length > 0) {
    // upsert, não insert puro — rede de segurança ADICIONAL à paginação
    // acima (que já corrige a causa raiz), não um substituto dela: mesmo
    // com a busca completa, upsert evita que qualquer outra causa futura
    // de "achei que era novo mas já existia" vire um 500 pro usuário em vez
    // de simplesmente atualizar a linha que já existe.
    const { error: insertError } = await supabase
      .from("properties")
      .upsert(toInsert, { onConflict: "competitor_id,external_id" });
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

        detectedChanges.push(
          await insertChange(
            {
              property_id: existing.id,
              old_price: existing.current_price,
              new_price: existing.current_price,
              old_status: "ativo",
              new_status: "possivelmente_vendido",
            },
            existing.external_id
          )
        );
      }
    }
  }

  return { changesDetected: detectedChanges.length, changes: detectedChanges };
}
