import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface AccountBanner {
  id: string;
  name: string;
  active: boolean;
}

// Usado pelo layout.tsx — roda em toda navegação dentro do shell escopado à
// conta, por isso busca só o mínimo pro banner "Visualizando: X" (não os
// dados completos de get-account-settings-data.ts).
export async function getAccountBanner(accountId: string): Promise<AccountBanner | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("accounts").select("id, name, active").eq("id", accountId).maybeSingle();
  if (error) throw new Error(`Falha ao buscar conta: ${error.message}`);
  return data;
}
