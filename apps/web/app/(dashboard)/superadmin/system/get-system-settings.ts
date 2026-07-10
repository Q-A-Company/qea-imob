import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface SystemSettings {
  emailGloballyEnabled: boolean;
  updatedAt: string;
}

// Singleton (id = true, uma linha só, garantida pela constraint no banco —
// ver migration 0010) — sempre existe, seedada pela própria migration.
export async function getSystemSettings(): Promise<SystemSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("system_settings").select("email_globally_enabled, updated_at").eq("id", true).single();
  if (error) throw new Error(`Falha ao buscar configurações do sistema: ${error.message}`);
  return { emailGloballyEnabled: data.email_globally_enabled, updatedAt: data.updated_at };
}
