import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const DEMO_ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";

const { data: competitor, error: cErr } = await supabase
  .from("competitors")
  .insert({ account_id: DEMO_ACCOUNT_ID, name: "Teste constraint probe", listing_url: "https://x.teste", polling_interval_minutes: 5, status: "ativo" })
  .select("id")
  .single();
if (cErr) throw cErr;

const { error } = await supabase
  .from("site_configs")
  .insert({ competitor_id: competitor.id, selectors: {}, version: 1, status: "pendente_revisao" });

console.log("insert status=pendente_revisao ->", error ? `ERRO: ${error.message}` : "OK");

await supabase.from("competitors").delete().eq("id", competitor.id);
