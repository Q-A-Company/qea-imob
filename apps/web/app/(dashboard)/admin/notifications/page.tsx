import { requireRole } from "@/lib/auth/dal";
import { NotificationsContent } from "./notifications-content";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const profile = await requireRole(["admin", "gerente"]);
  const resolvedSearchParams = await searchParams;
  const page = Math.max(1, Number(resolvedSearchParams.page) || 1);
  return <NotificationsContent accountId={profile.account_id ?? ""} page={page} basePath="/admin/notifications" />;
}
