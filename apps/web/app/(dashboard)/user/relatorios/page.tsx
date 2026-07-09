import { requireRole } from "@/lib/auth/dal";
import { RelatoriosContent } from "../../admin/relatorios/relatorios-content";
import type { SearchParams } from "../../admin/relatorios/parse-filters";

export default async function UserRelatoriosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const profile = await requireRole("usuario");
  const resolvedSearchParams = await searchParams;
  return <RelatoriosContent accountId={profile.account_id!} searchParams={resolvedSearchParams} basePath="/user/relatorios" />;
}
