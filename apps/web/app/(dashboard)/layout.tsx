import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth/dal";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { NotificationBell } from "./notification-bell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar role={profile.role} />
      {/* pl-16 reserva exatamente a largura colapsada da sidebar — ela
          expande por cima (overlay, position fixed em sidebar.tsx), então
          essa margem nunca muda e o conteúdo nunca "pula". pb-16 no mobile
          reserva espaço pro bottom nav fixo. */}
      <div className="pb-16 md:pb-0 md:pl-16 print:pb-0 print:pl-0">
        <Header
          fullName={profile.full_name}
          role={profile.role}
          notificationSlot={profile.account_id ? <NotificationBell accountId={profile.account_id} /> : null}
        />
        <main className="p-6 print:p-0">{children}</main>
      </div>
    </div>
  );
}
