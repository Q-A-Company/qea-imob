"use client";

import { ROLE_LABEL } from "@/lib/supabase/types";
import type { AccountUser } from "@/lib/users/get-account-users";
import type { LoginAuditRow } from "@/lib/audit/get-user-login-audit";
import type { AuditLogRow } from "@/lib/audit/get-user-audit-log";
import { Avatar } from "@/app/(dashboard)/avatar";
import { Tabs } from "@/app/(dashboard)/tabs";
import { UserSummaryTab } from "@/app/superadmin/accounts/[id]/user-summary-tab";
import { UserEmployeeDataTab } from "@/app/superadmin/accounts/[id]/user-employee-data-tab";
import { UserAccessLogTab } from "@/app/superadmin/accounts/[id]/user-access-log-tab";
import { UserHistoryTab } from "@/app/superadmin/accounts/[id]/user-history-tab";
import { SelfSecurityTab } from "./self-security-tab";
import { updateOwnProfileAction, uploadOwnAvatarAction, updateOwnPasswordAction } from "@/lib/profile/actions";

// Página de PERFIL PRÓPRIO (/profile) — qualquer cargo chega aqui clicando
// no header (ver header.tsx). Reaproveita Resumo/Dados do Colaborador/
// Acessos/Histórico da tela de gestão (superadmin/accounts/[id]/...) tal
// como estão, sem modificação — só a aba Segurança é própria
// (SelfSecurityTab, só troca de senha; ver o porquê em user-edit-content.tsx
// e user-security-tab.tsx). Diferente de UserEditContent, as ações não vêm
// via prop: só existe UMA variante de cada ação de autoatendimento (não há
// "SuperAdmin vs Admin/Gerente" pra distinguir aqui — editar a si mesmo é
// igual pra qualquer cargo), então importa lib/profile/actions.ts direto.
export function SelfProfileContent({
  user,
  loginAudit,
  auditLog,
}: {
  user: AccountUser;
  loginAudit: { rows: LoginAuditRow[]; totalCount: number };
  auditLog: { rows: AuditLogRow[]; totalCount: number };
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Avatar avatarUrl={user.avatarUrl} fullName={user.fullName} size="lg" />
        <div>
          <h1 className="text-lg font-semibold text-foreground">{user.fullName ?? "Sem nome"}</h1>
          <p className="text-sm text-muted">{ROLE_LABEL[user.role]}</p>
        </div>
      </div>

      <Tabs
        tabs={[
          { id: "resumo", label: "Resumo" },
          { id: "dados", label: "Dados do Colaborador" },
          { id: "seguranca", label: "Segurança" },
          { id: "acessos", label: "Acessos" },
          { id: "historico", label: "Histórico" },
        ]}
      >
        {(activeTab) => {
          if (activeTab === "resumo") return <UserSummaryTab user={user} />;
          if (activeTab === "dados") {
            return <UserEmployeeDataTab user={user} onUpdateProfile={updateOwnProfileAction} onUploadAvatar={uploadOwnAvatarAction} />;
          }
          if (activeTab === "acessos") return <UserAccessLogTab rows={loginAudit.rows} totalCount={loginAudit.totalCount} />;
          if (activeTab === "historico") return <UserHistoryTab rows={auditLog.rows} totalCount={auditLog.totalCount} />;
          return <SelfSecurityTab onUpdatePassword={updateOwnPasswordAction} />;
        }}
      </Tabs>
    </div>
  );
}
