import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const competitorId = process.argv[2];
const { data, error } = await supabase
  .from("site_configs")
  .select("selectors, confidence_score, status")
  .eq("competitor_id", competitorId)
  .single();

if (error) throw error;
console.log(JSON.stringify(data, null, 2));
