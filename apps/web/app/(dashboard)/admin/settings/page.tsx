import { requireRole } from "@/lib/auth/dal";

// Placeholder deliberadamente mínimo — gestão de notification_settings
// (site/e-mail/whatsapp) e outras preferências de conta é um próximo passo
// natural, mas não fazia parte do que foi pedido nesta etapa (dashboard +
// estrutura de navegação). Existe pra o item do menu não ficar quebrado.
export default async function SettingsPage() {
  await requireRole(["admin", "gerente"]);

  return (
    <div>
      <h1 className="text-lg font-semibold text-foreground">Configurações</h1>
      <p className="mt-1 text-sm text-muted">
        Gestão de preferências de notificação e conta chega numa próxima etapa.
      </p>
    </div>
  );
}
