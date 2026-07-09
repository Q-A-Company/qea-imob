import { requireRole } from "@/lib/auth/dal";
import { getDashboardData } from "./get-dashboard-data";
import { DashboardClient } from "./dashboard-client";

export default async function AdminPage() {
  const profile = await requireRole("admin");
  // account_id só é null para superadmin, que nunca chega em requireRole("admin").
  const data = await getDashboardData(profile.account_id!);

  return <DashboardClient data={data} fullName={profile.full_name} />;
}
