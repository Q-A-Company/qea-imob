import { createClient } from "@/lib/supabase/server";
import { NotificationBellClient } from "./notification-bell-client";
import type { UserRole } from "@/lib/supabase/types";

// Server Component: busca via cliente RLS-scoped (a policy
// "account_members_select" já restringe a notifications.account_id =
// current_account_id() — não precisa filtrar de novo aqui, mas o .eq
// explícito documenta a intenção e evita depender só da RLS por engano).
export async function NotificationBell({ accountId, role }: { accountId: string; role: UserRole }) {
  const supabase = await createClient();

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, title, message, read, created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(10);

  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("read", false);

  // Mesma regra de base path do sidebar.tsx (duplicada de propósito, é só
  // uma linha — ver comentário sobre ROLE_HOME lá).
  const base = role === "usuario" ? "/user" : "/admin";

  return (
    <NotificationBellClient
      notifications={notifications ?? []}
      unreadCount={unreadCount ?? 0}
      viewAllHref={`${base}/notifications`}
    />
  );
}
