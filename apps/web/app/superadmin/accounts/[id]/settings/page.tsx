import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { getAccountSettingsData } from "../get-account-settings-data";
import { AccountStatusToggle } from "../account-status-toggle";
import { AccountNotesEditor } from "../account-notes-editor";

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
        {data.pendingReviewCount > 0 && (
          <p className="font-medium text-erro-texto">
            {data.pendingReviewCount} config. de site aguardando revisão
          </p>
        )}
      </div>

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
