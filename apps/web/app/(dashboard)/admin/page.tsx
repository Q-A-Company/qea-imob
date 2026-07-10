import { requireRole } from "@/lib/auth/dal";
import { DashboardContent } from "./dashboard-content";

export default async function AdminPage() {
  const profile = await requireRole(["admin", "gerente"]);
  // account_id só é null para superadmin, que nunca chega em requireRole(["admin", "gerente"]).
  return <DashboardContent accountId={profile.account_id!} fullName={profile.full_name} canManage />;
}
