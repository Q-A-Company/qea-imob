import { requireRole } from "@/lib/auth/dal";
import { RelatoriosContent } from "@/app/(dashboard)/admin/relatorios/relatorios-content";
import type { SearchParams } from "@/app/(dashboard)/admin/relatorios/parse-filters";

export default async function AccountRelatoriosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireRole("superadmin");
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  return (
    <RelatoriosContent accountId={id} searchParams={resolvedSearchParams} basePath={`/superadmin/accounts/${id}/relatorios`} />
  );
}
