import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { getAccountUser } from "@/lib/users/get-account-users";
import { getUserLoginAudit } from "@/lib/audit/get-user-login-audit";
import { getUserAuditLog } from "@/lib/audit/get-user-audit-log";
import { UserEditContent } from "@/app/superadmin/accounts/[id]/user-edit-content";
import {
  changeUserRoleActionForAdmin,
  deleteUserActionForAdmin,
  removeUserAvatarActionForAdmin,
  resetUserPasswordActionForAdmin,
  setUserPasswordActionForAdmin,
  toggleUserBanActionForAdmin,
  updateUserProfileActionForAdmin,
  uploadUserAvatarActionForAdmin,
} from "@/lib/users/actions";

export default async function AdminUserEditPage({ params }: { params: Promise<{ userId: string }> }) {
  const profile = await requireRole(["admin", "gerente"]);
  const { userId } = await params;
  const accountId = profile.account_id!;
  const user = await getAccountUser(accountId, userId);
  if (!user) notFound();

  const [loginAudit, auditLog] = await Promise.all([
    getUserLoginAudit(accountId, userId),
    getUserAuditLog(accountId, userId),
  ]);

  return (
    <UserEditContent
      user={user}
      viewerRole={profile.role}
      backHref="/admin/users"
      loginAudit={loginAudit}
      auditLog={auditLog}
      actions={{
        changeRole: changeUserRoleActionForAdmin,
        toggleBan: toggleUserBanActionForAdmin,
        deleteUser: deleteUserActionForAdmin,
        resetPassword: resetUserPasswordActionForAdmin,
        setPassword: setUserPasswordActionForAdmin,
        updateProfile: updateUserProfileActionForAdmin,
        uploadAvatar: uploadUserAvatarActionForAdmin,
        removeAvatar: removeUserAvatarActionForAdmin,
      }}
    />
  );
}
