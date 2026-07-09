import { createClient } from "@/lib/supabase/server";
import { getReportData } from "./get-report-data";
import { parseFilters, type SearchParams } from "./parse-filters";
import { ReportFiltersForm } from "./report-filters";
import { ReportTable } from "./report-table";
import { PrintHeader } from "./print-header";
import { PrintButton } from "./print-button";

// Compartilhado entre /admin/relatorios e /user/relatorios (Etapa 11) —
// filtros/tabela/impressão são inteiramente de leitura, nenhum controle de
// gestão aqui. basePath diferencia pra onde o formulário de filtros navega
// (ver report-filters.tsx) e a paginação/ordenação (buildUrl).
export async function RelatoriosContent({
  accountId,
  searchParams,
  basePath,
}: {
  accountId: string;
  searchParams: SearchParams;
  basePath: string;
}) {
  const filters = parseFilters(searchParams);

  const supabase = await createClient();
  const { data: account } = await supabase.from("accounts").select("name").eq("id", accountId).single();

  const { rows, totalCount, competitors } = await getReportData(accountId, filters);

  const competitorLabel = filters.competitorIds
    ? competitors
        .filter((c) => filters.competitorIds!.includes(c.id))
        .map((c) => c.abbreviation)
        .join(", ") || "Nenhum"
    : "Todos";

  function buildUrl(overrides: Record<string, string>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (typeof value === "string") params.set(key, value);
    }
    for (const [key, value] of Object.entries(overrides)) {
      params.set(key, value);
    }
    return `${basePath}?${params.toString()}`;
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
      <ReportFiltersForm key={JSON.stringify(searchParams)} competitors={competitors} filters={filters} basePath={basePath} />

      <PrintHeader accountName={account?.name ?? "Conta"} filters={filters} competitorLabel={competitorLabel} />

      <ReportTable rows={rows} totalCount={totalCount} page={filters.page} sort={filters.sort} buildUrl={buildUrl} />

      {/* Repete em toda página impressa via position:fixed (globals.css).
          Numeração real "página N de M" não é confiável só com CSS nos
          motores de impressão atuais — decisão registrada na Etapa 10.1. */}
      <div className="hidden print:block print-footer">Q&amp;A Imob · Relatório gerado em {new Date().toLocaleString("pt-BR")}</div>
    </div>
  );
}
