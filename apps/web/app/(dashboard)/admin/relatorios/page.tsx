import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { getReportData } from "./get-report-data";
import { parseFilters, type SearchParams } from "./parse-filters";
import { ReportFiltersForm } from "./report-filters";
import { ReportTable } from "./report-table";
import { PrintHeader } from "./print-header";
import { PrintButton } from "./print-button";

export default async function RelatoriosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const profile = await requireRole("admin");
  const resolvedSearchParams = await searchParams;
  const filters = parseFilters(resolvedSearchParams);

  const supabase = await createClient();
  const { data: account } = await supabase.from("accounts").select("name").eq("id", profile.account_id ?? "").single();

  const { rows, totalCount, competitors } = await getReportData(profile.account_id!, filters);

  const competitorLabel = filters.competitorIds
    ? competitors
        .filter((c) => filters.competitorIds!.includes(c.id))
        .map((c) => c.abbreviation)
        .join(", ") || "Nenhum"
    : "Todos";

  function buildUrl(overrides: Record<string, string>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(resolvedSearchParams)) {
      if (typeof value === "string") params.set(key, value);
    }
    for (const [key, value] of Object.entries(overrides)) {
      params.set(key, value);
    }
    return `/admin/relatorios?${params.toString()}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Relatórios</h1>
          <p className="mt-1 text-sm text-muted">Histórico completo de mudanças de preço e disponibilidade, com filtros.</p>
        </div>
        <PrintButton />
      </div>

      {/* key força o formulário a remontar sempre que a URL de filtros
          muda (inclusive "Limpar filtros", que navega sem nenhum
          parâmetro) — sem isso, o useState interno só lê os valores
          iniciais na primeira montagem e ignora trocas de searchParams,
          deixando os campos mostrando a seleção antiga mesmo depois da
          navegação já ter resetado os dados/tabela. */}
      <ReportFiltersForm key={JSON.stringify(resolvedSearchParams)} competitors={competitors} filters={filters} />

      <PrintHeader accountName={account?.name ?? "Conta"} filters={filters} competitorLabel={competitorLabel} />

      <ReportTable rows={rows} totalCount={totalCount} page={filters.page} sort={filters.sort} buildUrl={buildUrl} />

      {/* Repete em toda página impressa via position:fixed (globals.css).
          Numeração real "página N de M" não é confiável só com CSS nos
          motores de impressão atuais — decisão registrada na Etapa 10.1. */}
      <div className="hidden print:block print-footer">Q&amp;A Imob · Relatório gerado em {new Date().toLocaleString("pt-BR")}</div>
    </div>
  );
}
