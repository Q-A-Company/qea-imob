"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { AccountUser } from "@/lib/users/get-account-users";
import type { LoginAuditRow } from "@/lib/audit/get-user-login-audit";
import type { AuditLogRow } from "@/lib/audit/get-user-audit-log";
import { ROLE_LABEL, type UserRole } from "@/lib/supabase/types";
import { Avatar } from "@/app/(dashboard)/avatar";
import { Tabs } from "@/app/(dashboard)/tabs";
import { canManageTarget, type UserManagementActions } from "./user-management-table";
import { UserSummaryTab } from "./user-summary-tab";
import { UserEmployeeDataTab } from "./user-employee-data-tab";
import { UserAccessLogTab } from "./user-access-log-tab";
import { UserHistoryTab } from "./user-history-tab";
import { UserSecurityTab } from "./user-security-tab";

interface ActionResult {
  error?: string;
  success?: boolean;
}

interface UploadResult extends ActionResult {
  avatarUrl?: string;
}

// Estende UserManagementActions (cargo/bloqueio/excluir/redefinir senha)
// com as duas ações novas da aba "Dados do Colaborador" — só usadas aqui,
// não na listagem principal, por isso ficam num tipo separado em vez de
// inchar UserManagementActions pra todo mundo que a importa.
export interface UserEditActions extends UserManagementActions {
  updateProfile: (userId: string, fullName: string, email: string, birthDate: string | null) => Promise<ActionResult>;
  uploadAvatar: (userId: string, formData: FormData) => Promise<UploadResult>;
  removeAvatar: (userId: string) => Promise<ActionResult>;
}

// Página de edição dedicada (rota própria, não modal — pedido explícito),
// com abas: Resumo, Dados do Colaborador, Segurança, Acessos, Histórico.
// Usada por quem GERENCIA outro usuário (admin/gerente/superadmin) — o
// equivalente pro próprio perfil (/profile) é SelfProfileContent, que
// reaproveita Resumo/Dados do Colaborador/Acessos/Histórico daqui mas tem
// sua PRÓPRIA aba Segurança (self-security-tab.tsx, só troca de senha —
// sem cargo/bloqueio/exclusão, porque essas ações não existem nesse
// componente, não são só escondidas).
//
// loginAudit/auditLog chegam já buscados pelo Server Component (page.tsx) —
// login_audit_log/audit_log têm policy de leitura própria (admin/gerente da
// conta) que não cobre SuperAdmin de propósito, então a busca usa service
// role do lado do servidor (ver lib/audit/get-user-login-audit.ts); aqui só
// exibe o que já chegou pronto.
export function UserEditContent({
  user,
  viewerRole,
  backHref,
  actions,
  loginAudit,
  auditLog,
}: {
  user: AccountUser;
  viewerRole: UserRole;
  backHref: string;
  actions: UserEditActions;
  loginAudit: { rows: LoginAuditRow[]; totalCount: number };
  auditLog: { rows: AuditLogRow[]; totalCount: number };
}) {
  const manageable = canManageTarget(viewerRole, user.role);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Voltar para Usuários
        </Link>
        <div className="mt-3 flex items-center gap-3">
          <Avatar avatarUrl={user.avatarUrl} fullName={user.fullName} size="lg" />
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-foreground">{user.fullName ?? "Sem nome"}</h1>
              <span className="text-sm text-muted">{ROLE_LABEL[user.role]}</span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  user.banned
                    ? "border-erro/30 bg-erro/10 text-erro-texto"
                    : "border-sucesso/30 bg-sucesso/10 text-sucesso-texto"
                }`}
              >
                {user.banned ? "Bloqueado" : "Ativo"}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted">{user.email ?? "e-mail não encontrado"}</p>
          </div>
        </div>
      </div>

      {!manageable ? (
        <p className="text-sm text-muted">Este usuário está fora do seu escopo de gestão.</p>
      ) : (
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
              return (
                <UserEmployeeDataTab
                  user={user}
                  onUpdateProfile={actions.updateProfile}
                  onUploadAvatar={actions.uploadAvatar}
                  onRemoveAvatar={actions.removeAvatar}
                />
              );
            }
            if (activeTab === "acessos") return <UserAccessLogTab rows={loginAudit.rows} totalCount={loginAudit.totalCount} />;
            if (activeTab === "historico") return <UserHistoryTab rows={auditLog.rows} totalCount={auditLog.totalCount} />;
            return <UserSecurityTab user={user} viewerRole={viewerRole} actions={actions} />;
          }}
        </Tabs>
      )}
    </div>
  );
}
