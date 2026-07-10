import type { ReportFilters } from "./get-report-data";

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function describeFilters(filters: ReportFilters, competitorLabel: string): string[] {
  const lines: string[] = [];
  lines.push(`Concorrentes: ${competitorLabel}`);
  lines.push(`Período: ${filters.from ? formatDate(filters.from) : "sem início"} até ${filters.to ? formatDate(filters.to) : "sem fim"}`);
  lines.push(
    `Tipo: ${filters.types.map((t) => (t === "preco" ? "Preço" : t === "adicionado" ? "Adicionado" : "Disponibilidade")).join(" + ")}`
  );
  lines.push(`Direção: ${filters.direction === "ambos" ? "Ambas" : filters.direction === "aumento" ? "Aumento" : "Redução"}`);
  if (filters.minVariation) {
    lines.push(`Variação mínima: ${filters.minVariation.value}${filters.minVariation.unit === "percent" ? "%" : " R$"}`);
  }
  lines.push(`Status do imóvel: ${filters.status === "ambos" ? "Ambos" : filters.status === "ativo" ? "Ativo" : "Possivelmente vendido"}`);
  if (filters.search) lines.push(`Busca: "${filters.search}"`);
  return lines;
}

// Só aparece na impressão/PDF (hidden na tela) — contexto necessário pra
// quem recebe o relatório sem ter visto a tela com os filtros aplicados.
export function PrintHeader({
  accountName,
  filters,
  competitorLabel,
}: {
  accountName: string;
  filters: ReportFilters;
  competitorLabel: string;
}) {
  const generatedAt = new Date().toLocaleString("pt-BR");

  return (
    <div className="hidden print:block print:mb-4">
      <h1 className="text-xl font-semibold text-black">Q&amp;A Imob — Relatório de Mudanças de Preço</h1>
      <p className="text-sm text-black">Conta: {accountName}</p>
      <p className="text-sm text-black">Gerado em: {generatedAt}</p>
      <ul className="mt-2 text-xs text-black">
        {describeFilters(filters, competitorLabel).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <hr className="my-3 border-neutral-300" />
    </div>
  );
}
