import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";
import { getAccountsData, type AccountListFilters } from "./get-accounts-data";

function parseFilters(searchParams: Record<string, string | string[] | undefined>): AccountListFilters {
  const statusRaw = typeof searchParams.status === "string" ? searchParams.status : "todos";
  const status: AccountListFilters["status"] = statusRaw === "ativo" || statusRaw === "inativo" ? statusRaw : "todos";
  const search = typeof searchParams.search === "string" && searchParams.search.trim() ? searchParams.search.trim() : null;
  return { search, status };
}

// Listagem de clientes (contas) — porta de entrada da gestão do SuperAdmin
// (Etapa 12). Formulário GET simples (sem client component): só 2 campos,
// não precisa do padrão com useState usado em report-filters.tsx (aquele
// tem campos múltiplos com toggle de array, esse não).
export default async function SuperAdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("superadmin");
  const filters = parseFilters(await searchParams);
  const accounts = await getAccountsData(filters);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Clientes</h1>
        <p className="mt-1 text-sm text-muted">
          Olá, {profile.full_name ?? profile.id}. Gerencie as contas cadastradas na plataforma.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-surface-border bg-surface p-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="search" className="text-xs font-medium text-muted">
            Buscar por nome
          </label>
          <input
            id="search"
            name="search"
            defaultValue={filters.search ?? ""}
            placeholder="ex: Sentineli"
            className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-signal"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="status" className="text-xs font-medium text-muted">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={filters.status}
            className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-signal"
          >
            <option value="todos">Todos</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
        </div>
        <button type="submit" className="rounded-md bg-signal px-4 py-2 text-sm font-semibold text-signal-on hover:opacity-90">
          Filtrar
        </button>
        {(filters.search || filters.status !== "todos") && (
          <Link href="/superadmin" className="text-sm text-muted hover:underline">
            Limpar filtros
          </Link>
        )}
      </form>

      {accounts.length === 0 && <p className="text-sm text-muted">Nenhuma conta encontrada.</p>}

      {accounts.length > 0 && (
        <ul className="divide-y divide-surface-border rounded-md border border-surface-border bg-surface">
          {accounts.map((account) => (
            <li key={account.id}>
              <Link
                href={`/superadmin/accounts/${account.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{account.name}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    <span className={account.active ? "text-sucesso-texto" : "text-erro-texto"}>
                      {account.active ? "Ativo" : "Inativo"}
                    </span>
                    {" · "}
                    {account.competitorsCount} {account.competitorsCount === 1 ? "concorrente" : "concorrentes"}
                    {" · "}
                    {account.usersCount} {account.usersCount === 1 ? "usuário" : "usuários"}
                    {" · desde "}
                    {new Date(account.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <span className="shrink-0 text-sm text-muted">Ver detalhes →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
