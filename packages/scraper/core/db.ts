import { createClient } from "@supabase/supabase-js";
import type { SiteConfigSelectors } from "../ai/site-config-schema.js";

// Tipos mínimos das tabelas que o worker (packages/scraper) toca. Não é o
// Database completo (esse vive em apps/web/lib/supabase/types.ts) — o
// worker é um processo separado por design (ver stack original), não deve
// depender do workspace do Next.js.
export interface CompetitorRow {
  id: string;
  account_id: string;
  name: string;
  listing_url: string;
  polling_interval_minutes: number;
  status: "ativo" | "pausado" | "erro";
  last_checked_at: string | null;
}

export interface SiteConfigRow {
  id: string;
  competitor_id: string;
  selectors: SiteConfigSelectors;
  version: number;
  confidence_score: number | null;
  status: "ativo" | "degradado" | "aprendendo" | "pendente_revisao";
  last_validated_at: string | null;
}

export interface ScraperRunInsert {
  competitor_id: string;
  run_type: "checagem" | "recalibracao";
  success: boolean;
  properties_captured: number;
  changes_detected: number;
  error_message: string | null;
  stopped_early_due_to_error: boolean;
}

// Service role: já vem com BYPASSRLS por padrão no Supabase (ver
// supabase/migrations/0001_init.sql, seção GRANTS) — não precisa de sessão
// de usuário, é o processo de confiança que roda as checagens de rotina.
export function createServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY precisam estar configurados");
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
