import { requireRole } from "@/lib/auth/dal";
import { NotificationsContent } from "../../admin/notifications/notifications-content";

export default async function UserNotificationsPage() {
  const profile = await requireRole("usuario");
  return <NotificationsContent accountId={profile.account_id ?? ""} />;
}
