import { createClient } from "@supabase/supabase-js";

// Cria um usuário Admin vinculado à conta demo (mesmo processo usado para o
// primeiro SuperAdmin: supabase.auth.admin.createUser com user_metadata,
// o trigger on_auth_user_created cuida de criar o profile — ver
// supabase/migrations/0001_init.sql e supabase/seed.sql).
//
// Uso:
//   node --env-file=apps/web/.env.local --import tsx scripts/create-admin.mjs <email> <senha> "<nome completo>"
//
// Rode uma vez para criar o usuário; depois pode apagar este script.

const DEMO_ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";

const [, , email, password, fullName] = process.argv;

if (!email || !password) {
  console.error('Uso: node --env-file=apps/web/.env.local --import tsx scripts/create-admin.mjs <email> <senha> "<nome completo>"');
  process.exit(1);
}

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY precisam estar configurados");
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: {
    role: "admin",
    account_id: DEMO_ACCOUNT_ID,
    full_name: fullName ?? "Admin Demo",
  },
});

if (error) throw error;

console.log("Usuário Admin criado:", { id: data.user.id, email: data.user.email });

const { data: profile, error: profileError } = await supabase
  .from("profiles")
  .select("id, account_id, role, full_name")
  .eq("id", data.user.id)
  .single();

if (profileError) throw profileError;
console.log("Profile criado pelo trigger:", profile);
