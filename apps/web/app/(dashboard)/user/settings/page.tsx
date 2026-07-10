import { requireRole } from "@/lib/auth/dal";
import { PersonalEmailPreferenceToggle } from "../../admin/settings/personal-email-preference-toggle";

// Mirror de /admin/settings (Etapa 11, mesmo padrão) — mas só a
// preferência pessoal. Corretor não gerencia os canais da conta (isso é
// admin/gerente), só a própria caixa de entrada.
export default async function UserSettingsPage() {
  const profile = await requireRole("usuario");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Configurações</h1>
        <p className="mt-1 text-sm text-muted">Sua preferência pessoal de notificação.</p>
      </div>

      <PersonalEmailPreferenceToggle initialEnabled={profile.email_notifications_enabled} />
    </div>
  );
}
