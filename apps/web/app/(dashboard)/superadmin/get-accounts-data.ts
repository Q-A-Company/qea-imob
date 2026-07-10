import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface AccountListItem {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  competitorsCount: number;
  usersCount: number;
}

export interface AccountListFilters {
  search: string | null;
  status: "ativo" | "inativo" | "todos";
}

// Busca sequencial simples e agrega em JS (mesmo motivo documentado em
// get-dashboard-data.ts: embeds tipados do PostgREST não são confiáveis com
// o Database escrito à mão deste projeto) — na escala de poucas contas
// clientes isso não é gargalo.
export async function getAccountsData(filters: AccountListFilters): Promise<AccountListItem[]> {
  const supabase = await createClient();

  let accountsQuery = supabase.from("accounts").select("id, name, active, created_at").order("name");
  if (filters.status !== "todos") accountsQuery = accountsQuery.eq("active", filters.status === "ativo");
  if (filters.search) accountsQuery = accountsQuery.ilike("name", `%${filters.search}%`);

  const { data: accounts, error: accountsError } = await accountsQuery;
  if (accountsError) throw new Error(`Falha ao buscar contas: ${accountsError.message}`);
  if (!accounts || accounts.length === 0) return [];

  const accountIds = accounts.map((a) => a.id);

  const [{ data: competitors, error: competitorsError }, { data: profiles, error: profilesError }] = await Promise.all([
    supabase.from("competitors").select("account_id").in("account_id", accountIds),
    supabase.from("profiles").select("account_id").in("account_id", accountIds),
  ]);
  if (competitorsError) throw new Error(`Falha ao contar concorrentes: ${competitorsError.message}`);
  if (profilesError) throw new Error(`Falha ao contar usuários: ${profilesError.message}`);

  const competitorCounts = new Map<string, number>();
  for (const c of competitors ?? []) competitorCounts.set(c.account_id, (competitorCounts.get(c.account_id) ?? 0) + 1);

  const userCounts = new Map<string, number>();
  for (const p of profiles ?? []) {
    if (!p.account_id) continue;
    userCounts.set(p.account_id, (userCounts.get(p.account_id) ?? 0) + 1);
  }

  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    active: a.active,
    createdAt: a.created_at,
    competitorsCount: competitorCounts.get(a.id) ?? 0,
    usersCount: userCounts.get(a.id) ?? 0,
  }));
}
