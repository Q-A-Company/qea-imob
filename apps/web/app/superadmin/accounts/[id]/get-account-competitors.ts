import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface AccountCompetitor {
  id: string;
  name: string;
  abbreviation: string;
  listingUrl: string;
  status: string;
  lastCheckedAt: string | null;
  pollingIntervalMinutes: number;
}

// Somente leitura — SuperAdmin observa, não gerencia (sem pausar/editar
// intervalo, isso é do Admin da própria conta em /admin/competitors).
export async function getAccountCompetitors(accountId: string): Promise<AccountCompetitor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("competitors")
    .select("id, name, abbreviation, listing_url, status, last_checked_at, polling_interval_minutes")
    .eq("account_id", accountId)
    .order("name");
  if (error) throw new Error(`Falha ao buscar concorrentes: ${error.message}`);

  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    abbreviation: c.abbreviation,
    listingUrl: c.listing_url,
    status: c.status,
    lastCheckedAt: c.last_checked_at,
    pollingIntervalMinutes: c.polling_interval_minutes,
  }));
}
