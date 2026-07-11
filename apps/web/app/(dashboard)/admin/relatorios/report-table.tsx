import Link from "next/link";
import { colorForCompetitor } from "@/lib/categorical-colors";
import { formatBRL } from "@/lib/format";
import { PropertyReferenceLink } from "../../property-reference-link";
import { PAGE_SIZE, type ReportRow } from "./get-report-data";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}

function formatDelta(oldPrice: number | null, newPrice: number | null): string {
  if (oldPrice === null || newPrice === null || oldPrice === 0) return "—";
  const pct = ((newPrice - oldPrice) / oldPrice) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

// Server Component puro — ordenação e paginação são <Link>s que mudam a URL
// (searchParams), sem precisar de estado client. Mesma tabela é usada na
// tela e (com o CSS print:) na impressão/PDF.
export function ReportTable({
  rows,
  totalCount,
  page,
  sort,
  buildUrl,
}: {
  rows: ReportRow[];
  totalCount: number;
  page: number;
  sort: "asc" | "desc";
  buildUrl: (overrides: Record<string, string>) => string;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between print:hidden">
        <p className="text-sm text-muted">
          {totalCount} {totalCount === 1 ? "mudança encontrada" : "mudanças encontradas"}
        </p>
        <Link href={buildUrl({ sort: sort === "desc" ? "asc" : "desc" })} className="text-sm text-muted hover:underline">
          Data {sort === "desc" ? "↓" : "↑"}
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-surface-border px-6 py-12 text-center text-sm text-muted">
          Nenhuma mudança encontrada com esses filtros.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-surface-border bg-surface print:!border-neutral-300 print:!bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border text-left text-xs text-muted print:!border-neutral-300 print:!text-black">
                <th className="px-3 py-2 font-medium">Concorrente</th>
                <th className="px-3 py-2 font-medium">Referência</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Preço antigo → novo</th>
                <th className="px-3 py-2 font-medium">Data/hora</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-surface-border last:border-b-0 print:!border-neutral-200">
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full print:hidden"
                        style={{ backgroundColor: colorForCompetitor(row.competitorId) }}
                        aria-hidden
                      />
                      <span className="font-mono text-xs font-semibold text-foreground print:!text-black">{row.competitorAbbreviation}</span>
                      <span className="text-xs text-muted print:!text-black">{row.competitorName}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-foreground print:!text-black">
                    <PropertyReferenceLink referenceCode={row.referenceCode} url={row.url} />
                  </td>
                  <td className="px-3 py-2 text-xs print:!text-black">
                    {row.changeType === "price" ? (
                      <span className="text-foreground print:!text-black">Preço</span>
                    ) : row.changeType === "added" ? (
                      <span className="rounded-full bg-sucesso/15 px-2 py-0.5 font-medium text-sucesso-texto print:!bg-transparent print:!text-black">
                        Adicionado
                      </span>
                    ) : row.changeType === "removed" ? (
                      <span className="rounded-full bg-erro/15 px-2 py-0.5 font-medium text-erro-texto print:!bg-transparent print:!text-black">
                        Possiv. vendido
                      </span>
                    ) : (
                      <span className="rounded-full bg-sucesso/15 px-2 py-0.5 font-medium text-sucesso-texto print:!bg-transparent print:!text-black">
                        Reapareceu
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs print:!text-black">
                    {row.changeType === "price" ? (
                      <span className="flex items-center gap-1.5">
                        <span className="text-muted line-through print:!text-black">{formatBRL(row.oldPrice)}</span>
                        <span className="text-muted print:!text-black">→</span>
                        <span className="font-semibold text-signal-text print:!text-black">{formatBRL(row.newPrice)}</span>
                        <span className="text-muted print:!text-black">({formatDelta(row.oldPrice, row.newPrice)})</span>
                      </span>
                    ) : row.changeType === "added" ? (
                      <span className="font-semibold text-sucesso-texto print:!text-black">{formatBRL(row.newPrice)}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted print:!text-black">{formatDateTime(row.detectedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-4 print:hidden">
          <Link
            href={buildUrl({ page: String(Math.max(1, page - 1)) })}
            aria-disabled={page <= 1}
            className={`text-sm ${page <= 1 ? "pointer-events-none text-muted/40" : "text-muted hover:underline"}`}
          >
            ‹ Anterior
          </Link>
          <span className="text-sm text-muted">
            Página {page} de {totalPages}
          </span>
          <Link
            href={buildUrl({ page: String(Math.min(totalPages, page + 1)) })}
            aria-disabled={page >= totalPages}
            className={`text-sm ${page >= totalPages ? "pointer-events-none text-muted/40" : "text-muted hover:underline"}`}
          >
            Próxima ›
          </Link>
        </div>
      )}
    </div>
  );
}
