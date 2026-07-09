import { requireRole } from "@/lib/auth/dal";
import { RelatoriosContent } from "./relatorios-content";
import type { SearchParams } from "./parse-filters";

export default async function RelatoriosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const profile = await requireRole("admin");
  const resolvedSearchParams = await searchParams;
  return <RelatoriosContent accountId={profile.account_id!} searchParams={resolvedSearchParams} basePath="/admin/relatorios" />;
}
