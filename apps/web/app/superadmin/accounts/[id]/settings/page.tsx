import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { getAccountSettingsData } from "../get-account-settings-data";
import { getPendingSiteConfigs } from "../get-pending-site-configs";
import { AccountStatusToggle } from "../account-status-toggle";
import { AccountNameEditor } from "../account-name-editor";
import { AccountNotesEditor } from "../account-notes-editor";
import { PendingSiteConfigReview } from "../pending-site-config-review";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR");
}

function NotificationChannelRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <p className="text-sm text-foreground">
      {label}: <span className={enabled ? "text-sucesso-texto" : "text-muted"}>{enabled ? "Ligado" : "Desligado"}</span>
    </p>
  );
}

export default async function AccountSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("superadmin");
  const { id } = await params;
  const data = await getAccountSettingsData(id);
  if (!data) notFound();
  const pendingConfigs = data.pendingReviewCount > 0 ? await getPendingSiteConfigs(id) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Configurações</h1>
          <p className="mt-1 text-sm text-muted">Dados gerais, notas internas e canais de notificação (somente leitura).</p>
        </div>
        <AccountStatusToggle accountId={data.id} active={data.active} />
      </div>

      <div className="flex flex-col gap-1 rounded-lg border border-surface-border bg-surface p-4 text-sm text-foreground">
        <p>Criado em: {formatDateTime(data.createdAt)}</p>
        <p>Concorrentes: {data.competitorsCount}</p>
        <p>Usuários: {data.usersCount}</p>
      </div>

      {/* Substitui o antigo indicador passivo (só a contagem) — agora lista
          cada site_config pendente com o contexto que o Admin já vê em
          register-form.tsx (estratégia/confiança/warnings) e ação real de
          aprovar/descartar, ver pending-site-config-review.tsx. */}
      <PendingSiteConfigReview accountId={data.id} configs={pendingConfigs} />

      <AccountNameEditor accountId={data.id} initialName={data.name} />

      <AccountNotesEditor accountId={data.id} initialNotes={data.internalNotes} />

      <div className="flex flex-col gap-2 rounded-lg border border-surface-border bg-surface p-4">
        <p className="text-sm font-medium text-foreground">Canais de notificação (gestão é do Admin da conta)</p>
        {data.notificationSettings ? (
          <>
            <NotificationChannelRow label="Site" enabled={data.notificationSettings.siteEnabled} />
            <NotificationChannelRow label="E-mail" enabled={data.notificationSettings.emailEnabled} />
            {/* WhatsApp em standby (decisão do usuário) — não mostrar uma
                opção que não funciona de verdade. Ver README. */}
          </>
        ) : (
          <p className="text-sm text-muted">Nenhuma configuração de notificação definida para esta conta ainda.</p>
        )}
      </div>
    </div>
  );
}
