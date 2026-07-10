import { requireRole } from "@/lib/auth/dal";
import { getAccountUsers } from "@/lib/users/get-account-users";
import { UserManagementTable } from "../user-management-table";
import { CreateUserForm } from "../create-user-form";
import {
  changeUserRoleAction,
  createUserAction,
  deleteUserAction,
  resetUserPasswordAction,
  setUserPasswordAction,
  toggleUserBanAction,
} from "../actions";

export default async function AccountUsersPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("superadmin");
  const { id } = await params;
  const users = await getAccountUsers(id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Usuários</h1>
        <p className="mt-1 text-sm text-muted">Cadastre e gerencie os usuários desta conta.</p>
      </div>

      {/* .bind(null, id) — não uma arrow function fechando sobre `id` — é
          o único jeito de "pré-preencher" o accountId numa Server Action
          que ainda pode atravessar a fronteira Server->Client Component.
          Uma closure comum (`(userId, newRole) => changeUserRoleAction(...)`)
          quebra em runtime: "Functions cannot be passed directly to Client
          Components". Por isso accountId é o primeiro parâmetro dessas
          Server Actions (bind só pré-preenche a partir do início). */}
      <CreateUserForm accountId={id} viewerRole="superadmin" action={createUserAction} />

      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Usuários existentes</h2>
        <UserManagementTable
          users={users}
          viewerRole="superadmin"
          basePath={`/superadmin/accounts/${id}/users`}
          actions={{
            changeRole: changeUserRoleAction.bind(null, id),
            toggleBan: toggleUserBanAction.bind(null, id),
            deleteUser: deleteUserAction.bind(null, id),
            resetPassword: resetUserPasswordAction.bind(null, id),
            setPassword: setUserPasswordAction.bind(null, id),
          }}
        />
      </div>
    </div>
  );
}
