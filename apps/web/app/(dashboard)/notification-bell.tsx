import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/supabase/types";

export interface NotificationBellItem {
  id: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  competitorId: string | null;
  competitorAbbreviation: string | null;
}

export interface NotificationBellData {
  notifications: NotificationBellItem[];
  unreadCount: number;
  viewAllHref: string;
}

// Busca só (não mais um Server Component com JSX) — o rodapé da sidebar
// (Etapa de remoção do header) precisa renderizar o sino DUAS vezes (bloco
// desktop e bloco mobile, dois lugares no DOM dentro de Sidebar, um Client
// Component), então quem busca os dados é (dashboard)/layout.tsx, uma vez
// só, e repassa como prop pros dois <NotificationBellClient> — evita
// duplicar a query rodando este componente duas vezes.
export async function getNotificationBellData(accountId: string, role: UserRole): Promise<NotificationBellData> {
  const supabase = await createClient();

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, title, message, read, created_at, competitor_id")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(10);

  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("read", false);

  // Duas queries sequenciais, não embed aninhado do PostgREST — mesmo
  // motivo já documentado em get-dashboard-data.ts/get-report-data.ts (o
  // Database type deste projeto não tem metadados de relacionamento
  // completos). competitor_id vem null pra notificações anteriores à
  // migration 0022 — CompetitorAvatar já trata isso com um fallback neutro.
  const competitorIds = [...new Set((notifications ?? []).map((n) => n.competitor_id).filter((id): id is string => id !== null))];
  const { data: competitors } = competitorIds.length
    ? await supabase.from("competitors").select("id, abbreviation").in("id", competitorIds)
    : { data: [] };
  const abbreviationById = new Map((competitors ?? []).map((c) => [c.id, c.abbreviation]));

  // Mesma regra de base path do sidebar.tsx (duplicada de propósito, é só
  // uma linha — ver comentário sobre ROLE_HOME lá).
  const base = role === "usuario" ? "/user" : "/admin";

  return {
    notifications: (notifications ?? []).map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      read: n.read,
      created_at: n.created_at,
      competitorId: n.competitor_id,
      competitorAbbreviation: n.competitor_id ? (abbreviationById.get(n.competitor_id) ?? null) : null,
    })),
    unreadCount: unreadCount ?? 0,
    viewAllHref: `${base}/notifications`,
  };
}
