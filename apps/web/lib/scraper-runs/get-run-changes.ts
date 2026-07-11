import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PropertyChangeType } from "@/lib/supabase/types";

export interface RunChangeDetail {
  id: string;
  referenceCode: string | null;
  url: string | null;
  changeType: PropertyChangeType;
  oldPrice: number | null;
  newPrice: number | null;
  oldStatus: string | null;
  newStatus: string | null;
  detectedAt: string;
}

const FETCH_PAGE_SIZE = 1000;
// 500 parecia seguro (mesmo valor usado em lib/competitors/actions.ts) mas
// falhou de verdade contra dados reais desta sessão — não é o PostgREST
// rejeitando com 400 (esse caso já era esperado), é um TypeError: fetch
// failed mais cedo, antes de qualquer resposta HTTP — provável limite de
// tamanho de URL/header da camada de rede, não do banco. Testado
// empiricamente contra UUIDs reais: 350 funciona, 400 falha
// consistentemente. 200 fica com boa margem abaixo disso.
const ID_CHUNK_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// Compartilhado entre Histórico (admin/history) e Relatório de Erros
// (superadmin/.../errors) — os dois mostram, ao expandir uma linha de
// scraper_run, exatamente quais property_changes ela gerou (migration 0016,
// scraper_run_id).
//
// O comentário original aqui assumia que "runIds de UMA página (20-30)
// nunca chega perto do limite de URL que quebrou com listas de milhares de
// properties" — verdade pro NÚMERO de runs, falso pro número de
// property_changes que UM ÚNICO run pode gerar: a primeira captura
// bem-sucedida de um concorrente grande (ex: Muller, 1075 imóveis) gera um
// evento 'added' por imóvel NUM SÓ scraper_run_id — reproduzido de verdade
// nesta sessão (Bad Request ao expandir esse run no Histórico). Duas
// correções, mesmo padrão já usado em outros lugares do projeto: (1)
// property_changes buscado com .range() explícito, não confiando que
// nunca passa de 1000 linhas; (2) a segunda query (properties por id)
// quebrada em lotes de ID_CHUNK_SIZE, não um .in() só com a lista inteira.
export async function getRunChangesByRunId(runIds: string[]): Promise<Map<string, RunChangeDetail[]>> {
  const result = new Map<string, RunChangeDetail[]>();
  if (runIds.length === 0) return result;

  const supabase = await createClient();

  const changes: {
    id: string;
    property_id: string;
    scraper_run_id: string | null;
    change_type: PropertyChangeType;
    old_price: number | null;
    new_price: number | null;
    old_status: string | null;
    new_status: string | null;
    detected_at: string;
  }[] = [];
  for (let offset = 0; ; offset += FETCH_PAGE_SIZE) {
    const { data, error: changesError } = await supabase
      .from("property_changes")
      .select("id, property_id, scraper_run_id, change_type, old_price, new_price, old_status, new_status, detected_at")
      .in("scraper_run_id", runIds)
      .order("detected_at", { ascending: true })
      .range(offset, offset + FETCH_PAGE_SIZE - 1);
    if (changesError) throw new Error(`Falha ao buscar mudanças da execução: ${changesError.message}`);
    changes.push(...(data ?? []));
    if (!data || data.length < FETCH_PAGE_SIZE) break;
  }
  if (changes.length === 0) return result;

  const propertyIds = [...new Set(changes.map((c) => c.property_id))];
  const properties: { id: string; reference_code: string | null; url: string }[] = [];
  for (const idsChunk of chunk(propertyIds, ID_CHUNK_SIZE)) {
    const { data, error: propertiesError } = await supabase.from("properties").select("id, reference_code, url").in("id", idsChunk);
    if (propertiesError) throw new Error(`Falha ao buscar imóveis das mudanças: ${propertiesError.message}`);
    properties.push(...(data ?? []));
  }

  const propertyById = new Map(properties.map((p) => [p.id, p]));

  for (const change of changes) {
    if (!change.scraper_run_id) continue;
    const property = propertyById.get(change.property_id);
    const detail: RunChangeDetail = {
      id: change.id,
      referenceCode: property?.reference_code ?? null,
      url: property?.url ?? null,
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
