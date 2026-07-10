import { requireRole } from "@/lib/auth/dal";
import { DashboardContent } from "@/app/(dashboard)/admin/dashboard-content";

// Mesmo componente do Painel de Admin/Usuario (Etapa 10/11) — já recebe
// accountId como parâmetro em vez de derivar da sessão, então "olhar o
// painel de outra conta" já era exatamente o que esse desenho permitia,
// sem mudar uma linha em dashboard-content.tsx. fullName=null: não é o
// painel do próprio SuperAdmin, não faz sentido uma saudação pessoal.
export default async function AccountDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("superadmin");
  const { id } = await params;
  return <DashboardContent accountId={id} fullName={null} canManage={false} />;
}
