import { requireRole } from "@/lib/auth/dal";
import { HistoryContent } from "./history-content";

export default async function HistoryPage() {
  const profile = await requireRole(["admin", "gerente"]);
  return <HistoryContent accountId={profile.account_id ?? ""} />;
}
