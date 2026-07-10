import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth/dal";
import { DashboardChrome } from "./dashboard-chrome";
import { Header } from "./header";
import { NotificationBell } from "./notification-bell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  // Mesmo padrão do cookie "theme" em app/layout.tsx: decidido no servidor,
  // sem script anti-flash — isso só define o valor INICIAL (evita flash no
  // primeiro paint); o estado interativo depois do clique vive em
  // dashboard-chrome.tsx (client). Fixada é o padrão agora — só recolhe se
  // o usuário desfixar explicitamente (cookie "false").
  const cookieStore = await cookies();
  const sidebarPinned = cookieStore.get("sidebar-pinned")?.value !== "false";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardChrome role={profile.role} initialPinned={sidebarPinned}>
        <Header
          fullName={profile.full_name}
          role={profile.role}
          notificationSlot={
            profile.account_id ? <NotificationBell accountId={profile.account_id} role={profile.role} /> : null
          }
        />
        <main className="p-6 print:p-0">{children}</main>
      </DashboardChrome>
    </div>
  );
}
