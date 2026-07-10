import { requireRole } from "@/lib/auth/dal";
import { NotificationsContent } from "./notifications-content";

export default async function NotificationsPage() {
  const profile = await requireRole(["admin", "gerente"]);
  return <NotificationsContent accountId={profile.account_id ?? ""} />;
}
