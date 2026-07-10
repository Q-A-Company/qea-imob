import { requireRole } from "@/lib/auth/dal";
import { NotificationsContent } from "../../admin/notifications/notifications-content";

export default async function UserNotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const profile = await requireRole("usuario");
  const resolvedSearchParams = await searchParams;
  const page = Math.max(1, Number(resolvedSearchParams.page) || 1);
  return <NotificationsContent accountId={profile.account_id ?? ""} page={page} basePath="/user/notifications" />;
}
