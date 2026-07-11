import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { getAccountUser } from "@/lib/users/get-account-users";
import { getUserLoginAudit } from "@/lib/audit/get-user-login-audit";
import { getUserAuditLog } from "@/lib/audit/get-user-audit-log";
import { UserEditContent } from "../../user-edit-content";
import {
  changeUserRoleAction,
  deleteUserAction,
  removeUserAvatarAction,
  resetUserPasswordAction,
  setUserPasswordAction,
  toggleUserBanAction,
  updateUserProfileAction,
  uploadUserAvatarAction,
} from "../../actions";

export default async function AccountUserEditPage({ params }: { params: Promise<{ id: string; userId: string }> }) {
  await requireRole("superadmin");
  const { id, userId } = await params;
  const user = await getAccountUser(id, userId);
  if (!user) notFound();

  const [loginAudit, auditLog] = await Promise.all([getUserLoginAudit(id, userId), getUserAuditLog(id, userId)]);

  return (
    <UserEditContent
      user={user}
      viewerRole="superadmin"
      backHref={`/superadmin/accounts/${id}/users`}
      loginAudit={loginAudit}
      auditLog={auditLog}
      actions={{
        changeRole: changeUserRoleAction.bind(null, id),
        toggleBan: toggleUserBanAction.bind(null, id),
        deleteUser: deleteUserAction.bind(null, id),
        resetPassword: resetUserPasswordAction.bind(null, id),
        setPassword: setUserPasswordAction.bind(null, id),
        updateProfile: updateUserProfileAction.bind(null, id),
        uploadAvatar: uploadUserAvatarAction.bind(null, id),
        removeAvatar: removeUserAvatarAction.bind(null, id),
      }}
    />
  );
}
