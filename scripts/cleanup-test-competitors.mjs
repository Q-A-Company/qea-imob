import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase.from("competitors").delete().ilike("name", "%teste%").select("id, name");
if (error) throw error;
console.log("Removidos:", data);
