import { AlertTriangle } from "lucide-react";
import { requireRole } from "@/lib/auth/dal";
import { getNotificationSettings } from "./get-notification-settings";
import { NotificationChannelToggle } from "./notification-channel-toggle";
import { PersonalEmailPreferenceToggle } from "./personal-email-preference-toggle";
import { AppearanceThemeToggle } from "./appearance-theme-toggle";
import { ClearHistoryButton } from "./clear-history-button";
import { IconChip } from "../../icon-chip";

export default async function SettingsPage() {
  const profile = await requireRole(["admin", "gerente"]);
  const settings = await getNotificationSettings(profile.account_id!);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Configurações</h1>
        <p className="mt-1 text-sm text-muted">Canais de notificação da sua conta.</p>
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Canais de notificação da conta</h2>
          <p className="mt-1 text-xs text-muted">Vale pra todo mundo da conta — Diretor / T.I, Gerente e Corretor.</p>
        </div>
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
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Sua preferência pessoal</h2>
          <p className="mt-1 text-xs text-muted">Independente do que está ligado acima pra conta inteira.</p>
        </div>
        <PersonalEmailPreferenceToggle initialEnabled={profile.email_notifications_enabled} />
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Aparência</h2>
          <p className="mt-1 text-xs text-muted">Preferência pessoal, vale só neste dispositivo.</p>
        </div>
        <AppearanceThemeToggle />
      </section>

      {/* Só Diretor/T.I (não Gerente) — decidido explicitamente com o
          usuário, dado o tamanho do impacto (conta inteira, irreversível).
          A action em si também restringe via requireRole("admin"); esse
          `if` aqui é só pra não mostrar o botão pra quem não pode usá-lo. */}
      {profile.role === "admin" && (
        <section className="flex flex-col gap-2 rounded-lg border border-erro/30 bg-erro/5 p-4">
          <h2 className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
            <IconChip icon={AlertTriangle} tone="erro" />
            Zona de perigo
          </h2>
          <p className="text-xs text-muted">
            Apaga permanentemente o histórico de mudanças (Feed e Relatórios) de todos os concorrentes desta conta. Imóveis
            capturados e configuração de extração não são afetados.
          </p>
          <ClearHistoryButton />
        </section>
      )}
    </div>
  );
}
