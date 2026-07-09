import { requireRole } from "@/lib/auth/dal";
import { HistoryContent } from "./history-content";

export default async function HistoryPage() {
  const profile = await requireRole("admin");
  return <HistoryContent accountId={profile.account_id ?? ""} />;
}
