// Espelha public.normalize_listing_url() (supabase/migrations/0019_archive_competitor_and_url_unique.sql)
// — usada aqui só pra montar a pré-checagem de duplicata (mensagem
// amigável antes do insert); a proteção definitiva contra corrida é a
// coluna gerada + UNIQUE(account_id, listing_url_normalized) no banco, que
// aplica exatamente esta mesma lógica do lado do Postgres. Minúsculas na
// URL inteira (não só o host) — simplificação aceita, mais fácil manter as
// duas versões em sincronia do que replicar um parser de URL em SQL puro.
export function normalizeListingUrl(url: string): string {
  return url.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}
