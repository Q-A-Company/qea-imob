import { requireRole } from "@/lib/auth/dal";
import { HistoryContent } from "./history-content";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const profile = await requireRole(["admin", "gerente"]);
  const resolvedSearchParams = await searchParams;
  const page = Math.max(1, Number(resolvedSearchParams.page) || 1);
  return <HistoryContent accountId={profile.account_id ?? ""} page={page} basePath="/admin/history" />;
}
