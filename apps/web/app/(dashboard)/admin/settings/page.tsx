import { requireRole } from "@/lib/auth/dal";
import { getNotificationSettings } from "./get-notification-settings";
import { NotificationChannelToggle } from "./notification-channel-toggle";
import { PersonalEmailPreferenceToggle } from "./personal-email-preference-toggle";

export default async function SettingsPage() {
  const profile = await requireRole(["admin", "gerente"]);
  const settings = await getNotificationSettings(profile.account_id!);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Configurações</h1>
        <p className="mt-1 text-sm text-muted">Canais de notificação da sua conta.</p>
      </div>

      <div className="flex flex-col gap-3">
        <NotificationChannelToggle
          channel="site"
          label="Sino do site"
          description="Notificação instantânea, por mudança, dentro do próprio painel."
          initialEnabled={settings.siteEnabled}
        />
        <NotificationChannelToggle
          channel="email"
          label="Resumo diário por e-mail"
          description="Um e-mail por dia, agregando as mudanças de preço do dia — não um e-mail por mudança."
          initialEnabled={settings.emailEnabled}
        />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-foreground">Sua preferência pessoal</h2>
        <p className="mt-1 mb-3 text-xs text-muted">Independente do que está ligado acima pra conta inteira.</p>
        <PersonalEmailPreferenceToggle initialEnabled={profile.email_notifications_enabled} />
      </div>
    </div>
  );
}
