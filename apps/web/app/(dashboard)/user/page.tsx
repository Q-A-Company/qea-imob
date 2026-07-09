import { requireRole } from "@/lib/auth/dal";
import { DashboardContent } from "../admin/dashboard-content";

export default async function UserPage() {
  const profile = await requireRole("usuario");
  // account_id só é null para superadmin, que nunca chega em requireRole("usuario").
  return <DashboardContent accountId={profile.account_id!} fullName={profile.full_name} canManage={false} />;
}
