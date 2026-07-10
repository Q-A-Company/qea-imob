import { requireRole } from "@/lib/auth/dal";
import { getSystemSettings } from "./get-system-settings";
import { GlobalEmailToggle } from "./global-email-toggle";

// Nível 1 — interruptor global de e-mail, visível só ao SuperAdmin.
// Plataforma inteira, não escopado a nenhuma conta — por isso vive na
// sidebar global do SuperAdmin ((dashboard)/sidebar.tsx), não dentro do
// shell por conta (app/superadmin/accounts/[id]/*).
export default async function SystemSettingsPage() {
  await requireRole("superadmin");
  const settings = await getSystemSettings();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Sistema</h1>
        <p className="mt-1 text-sm text-muted">Controles que afetam a plataforma inteira, não uma conta específica.</p>
      </div>

      <GlobalEmailToggle initialEnabled={settings.emailGloballyEnabled} initialUpdatedAt={settings.updatedAt} />
    </div>
  );
}
