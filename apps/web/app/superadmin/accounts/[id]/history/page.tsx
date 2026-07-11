import { requireRole } from "@/lib/auth/dal";
import { HistoryContent } from "@/app/(dashboard)/admin/history/history-content";

export default async function AccountHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  await requireRole("superadmin");
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const page = Math.max(1, Number(resolvedSearchParams.page) || 1);
  return (
    <HistoryContent
      accountId={id}
      page={page}
      basePath={`/superadmin/accounts/${id}/history`}
      subtitle="Execuções de checagem e recalibração dos concorrentes desta conta."
    />
  );
}
