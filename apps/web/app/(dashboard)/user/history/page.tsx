import { requireRole } from "@/lib/auth/dal";
import { HistoryContent } from "../../admin/history/history-content";

export default async function UserHistoryPage() {
  const profile = await requireRole("usuario");
  return <HistoryContent accountId={profile.account_id ?? ""} />;
}
