import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { getAccountAuditLog } from "@/lib/audit/get-account-audit-log";
import { AccountActivityList } from "../account-activity-list";

export default async function AccountActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  await requireRole("superadmin");
  const { id } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const supabase = await createClient();
  const { data: account } = await supabase.from("accounts").select("id").eq("id", id).maybeSingle();
  if (!account) notFound();

  const { rows, totalCount } = await getAccountAuditLog(id, page);

  function buildUrl(overrides: Record<string, string>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(overrides)) params.set(key, value);
    return `/superadmin/accounts/${id}/activity?${params.toString()}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Atividade</h1>
        <p className="mt-1 text-sm text-muted">
          Tudo que aconteceu nesta conta — concorrentes, usuários, configurações e relatórios. Acessos (login/logout) não
          aparecem aqui.
        </p>
      </div>

      <AccountActivityList rows={rows} totalCount={totalCount} page={page} buildUrl={buildUrl} />
    </div>
  );
}
