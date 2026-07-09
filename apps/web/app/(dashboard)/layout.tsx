import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth/dal";
import { logout } from "@/lib/auth/actions";
import { NotificationBell } from "./notification-bell";

const ROLE_LABEL: Record<string, string> = {
  superadmin: "SuperAdmin",
  admin: "Admin",
  usuario: "Usuário",
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3 dark:border-neutral-800 dark:bg-neutral-900">
        <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
          Q&A Imob
        </span>
        <div className="flex items-center gap-4">
          {profile.account_id && <NotificationBell accountId={profile.account_id} />}
          <span className="text-sm text-neutral-500 dark:text-neutral-400">
            {profile.full_name ?? "Sem nome"} · {ROLE_LABEL[profile.role]}
          </span>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Sair
            </button>
          </form>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
