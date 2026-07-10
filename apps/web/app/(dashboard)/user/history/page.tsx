import { requireRole } from "@/lib/auth/dal";
import { HistoryContent } from "../../admin/history/history-content";

export default async function UserHistoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const profile = await requireRole("usuario");
  const resolvedSearchParams = await searchParams;
  const page = Math.max(1, Number(resolvedSearchParams.page) || 1);
  return <HistoryContent accountId={profile.account_id ?? ""} page={page} basePath="/user/history" />;
}
