import { createServiceClient, type CompetitorRow } from "../core/db.js";

// Decide quem está "devido" para checagem: status ativo e
// (nunca checado, ou já passou polling_interval_minutes desde a última vez).
// Filtragem em JS, não em SQL — número de concorrentes por conta é pequeno
// o bastante pra isso não ser um problema agora; se crescer, dá pra mover
// pra uma função/view no banco sem mudar a interface desta função.
export async function getDueCompetitors(): Promise<CompetitorRow[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("competitors")
    .select("id, account_id, name, listing_url, polling_interval_minutes, status, last_checked_at")
    .eq("status", "ativo");

  if (error) throw new Error(`Falha ao buscar concorrentes: ${error.message}`);

  const now = Date.now();
  return ((data ?? []) as CompetitorRow[]).filter((c) => {
    if (c.last_checked_at === null) return true;
    const dueAt = new Date(c.last_checked_at).getTime() + c.polling_interval_minutes * 60_000;
    return dueAt <= now;
  });
}
