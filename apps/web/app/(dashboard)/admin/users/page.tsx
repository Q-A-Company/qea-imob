import { requireRole } from "@/lib/auth/dal";
import { getAccountUsers } from "@/lib/users/get-account-users";
import { UserManagementTable } from "@/app/superadmin/accounts/[id]/user-management-table";
import { CreateUserForm } from "@/app/superadmin/accounts/[id]/create-user-form";
import {
  changeUserRoleActionForAdmin,
  createUserActionForAdmin,
  deleteUserActionForAdmin,
  resetUserPasswordActionForAdmin,
  toggleUserBanActionForAdmin,
} from "@/lib/users/actions";

// Lacuna do desenho original de roles (Etapa 2) implementada aqui: Admin
// ("Diretor / T.I") e Gerente gerenciam usuários da PRÓPRIA conta —
// reaproveita os mesmos componentes da Etapa 12 (SuperAdmin), só trocando
// as Server Actions injetadas (lib/users/actions.ts deriva accountId da
// sessão, nunca de parâmetro) e o viewerRole (controla o teto de hierarquia
// dentro do componente: Gerente só gerencia Corretor).
export default async function AdminUsersPage() {
  const profile = await requireRole(["admin", "gerente"]);
  const accountId = profile.account_id!;
  const users = await getAccountUsers(accountId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Usuários</h1>
        <p className="mt-1 text-sm text-muted">Cargo, redefinir senha, ativar/desativar e excluir usuários da sua conta.</p>
      </div>

      <UserManagementTable
        users={users}
        viewerRole={profile.role}
        actions={{
          changeRole: changeUserRoleActionForAdmin,
          toggleBan: toggleUserBanActionForAdmin,
          deleteUser: deleteUserActionForAdmin,
          resetPassword: resetUserPasswordActionForAdmin,
        }}
      />
      <CreateUserForm viewerRole={profile.role} action={createUserActionForAdmin} />
    </div>
  );
}
