import { getDashboardData } from "./get-dashboard-data";
import { DashboardClient } from "./dashboard-client";

// Compartilhado entre /admin (canManage=true) e /user (canManage=false,
// Etapa 11) — mesma query, mesmo componente de exibição. A única
// diferença de comportamento é o CTA do estado vazio.
export async function DashboardContent({
  accountId,
  fullName,
  canManage,
}: {
  accountId: string;
  fullName: string | null;
  canManage: boolean;
}) {
  const data = await getDashboardData(accountId);
  return <DashboardClient data={data} fullName={fullName} canManage={canManage} />;
}
