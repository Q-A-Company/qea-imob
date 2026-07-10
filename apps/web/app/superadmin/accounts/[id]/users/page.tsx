import { requireRole } from "@/lib/auth/dal";
import { getAccountUsers } from "../get-account-users";
import { UserManagementTable } from "../user-management-table";
import { CreateUserForm } from "../create-user-form";

export default async function AccountUsersPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("superadmin");
  const { id } = await params;
  const users = await getAccountUsers(id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Usuários</h1>
        <p className="mt-1 text-sm text-muted">Cargo, redefinir senha, ativar/desativar e excluir usuários desta conta.</p>
      </div>

      <UserManagementTable users={users} accountId={id} />
      <CreateUserForm accountId={id} />
    </div>
  );
}
