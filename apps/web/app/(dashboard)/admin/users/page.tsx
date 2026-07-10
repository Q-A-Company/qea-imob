import { requireRole } from "@/lib/auth/dal";
import { getAccountUsers } from "@/lib/users/get-account-users";
import { UserManagementTable } from "@/app/superadmin/accounts/[id]/user-management-table";
import { CreateUserForm } from "@/app/superadmin/accounts/[id]/create-user-form";
import {
  changeUserRoleActionForAdmin,
  createUserActionForAdmin,
  deleteUserActionForAdmin,
  resetUserPasswordActionForAdmin,
  setUserPasswordActionForAdmin,
  toggleUserBanActionForAdmin,
} from "@/lib/users/actions";

// Lacuna do desenho original de roles (Etapa 2) implementada aqui: Admin
// ("Diretor / T.I") e Gerente gerenciam usuários da PRÓPRIA conta —
// reaproveita os mesmos componentes da Etapa 12 (SuperAdmin), só trocando
// as Server Actions injetadas (lib/users/actions.ts deriva accountId da
// sessão, nunca de parâmetro) e o viewerRole (controla o teto de hierarquia
// dentro do componente: Gerente só gerencia Corretor).
//
// Cadastro no topo, listagem "Usuários Existentes" abaixo — cargo, senha,
// bloqueio e exclusão em detalhe moraram pra a página de edição dedicada
// ([userId]/page.tsx), a lista aqui só mostra o resumo (nome, e-mail,
// cargo, status) + ícones editar/excluir.
export default async function AdminUsersPage() {
  const profile = await requireRole(["admin", "gerente"]);
  const accountId = profile.account_id!;
  const users = await getAccountUsers(accountId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Usuários</h1>
        <p className="mt-1 text-sm text-muted">Cadastre e gerencie os usuários da sua conta.</p>
      </div>

      <CreateUserForm viewerRole={profile.role} action={createUserActionForAdmin} />

      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Usuários existentes</h2>
        <UserManagementTable
          users={users}
          viewerRole={profile.role}
          basePath="/admin/users"
          actions={{
            changeRole: changeUserRoleActionForAdmin,
            toggleBan: toggleUserBanActionForAdmin,
            deleteUser: deleteUserActionForAdmin,
            resetPassword: resetUserPasswordActionForAdmin,
            setPassword: setUserPasswordActionForAdmin,
          }}
        />
      </div>
    </div>
  );
}
