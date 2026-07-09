import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const competitorId = process.argv[2];
const { data, error, count } = await supabase
  .from("properties")
  .select("*", { count: "exact" })
  .eq("competitor_id", competitorId)
  .limit(3);

if (error) throw error;
console.log("total de linhas para este competitor_id:", count);
console.log(JSON.stringify(data, null, 2));
