"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { defaultDateRange } from "./default-date-range";
import type { ReportFilters } from "./get-report-data";

const inputClass =
  "rounded-md border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-signal";

export function ReportFiltersForm({
  competitors,
  filters,
}: {
  competitors: { id: string; name: string; abbreviation: string }[];
  filters: ReportFilters;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedCompetitors, setSelectedCompetitors] = useState<string[] | null>(filters.competitorIds);
  const [from, setFrom] = useState(filters.from ?? "");
  const [to, setTo] = useState(filters.to ?? "");
  const [types, setTypes] = useState(filters.types);
  const [direction, setDirection] = useState(filters.direction);
  const [minVariationValue, setMinVariationValue] = useState(filters.minVariation ? String(filters.minVariation.value) : "");
  const [minVariationUnit, setMinVariationUnit] = useState<"reais" | "percent">(filters.minVariation?.unit ?? "reais");
  const [status, setStatus] = useState(filters.status);
  const [search, setSearch] = useState(filters.search ?? "");

  // Direção diferente de "ambos" ou variação mínima preenchida excluem
  // mudanças de disponibilidade do resultado (não têm preço pra comparar) —
  // avisado aqui, em tempo real, não só depois do resultado vir vazio.
  const excludesAvailability = direction !== "ambos" || minVariationValue.trim() !== "";

  function toggleCompetitor(id: string) {
    setSelectedCompetitors((prev) => {
      const current = prev ?? competitors.map((c) => c.id);
      if (current.includes(id)) {
        const next = current.filter((c) => c !== id);
        return next.length === competitors.length ? null : next;
      }
      const next = [...current, id];
      return next.length === competitors.length ? null : next;
    });
  }

  function toggleType(type: "preco" | "disponibilidade") {
    setTypes((prev) => {
      if (prev.includes(type)) {
        const next = prev.filter((t) => t !== type);
        return next.length === 0 ? prev : next; // nunca deixa vazio
      }
      return [...prev, type];
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());

    if (selectedCompetitors) params.set("competitors", selectedCompetitors.join(","));
    else params.delete("competitors");

    params.set("from", from);
    params.set("to", to);
    params.set("types", types.join(","));
    params.set("direction", direction);
    params.set("status", status);
    if (search) params.set("search", search);
    else params.delete("search");
    if (minVariationValue.trim()) {
      params.set("minVariation", minVariationValue.trim());
      params.set("minVariationUnit", minVariationUnit);
    } else {
      params.delete("minVariation");
      params.delete("minVariationUnit");
    }
    params.delete("page"); // qualquer mudança de filtro volta pra página 1

    router.push(`/admin/relatorios?${params.toString()}`);
  }

  function clearDateRange() {
    setFrom("");
    setTo("");
  }

  // Reseta o estado local diretamente, em vez de só navegar — navegar
  // sozinho (Link pra /admin/relatorios) só resetava os campos QUANDO a URL
  // já tinha parâmetros aplicados (ex: depois de um "Aplicar filtros"). Se o
  // usuário só mexeu nos campos sem nunca ter submetido, a URL já era
  // /admin/relatorios sem parâmetros — nada mudava, e os campos em edição
  // ficavam intocados. Resetando o state aqui, funciona nos dois casos.
  function handleClear() {
    const defaults = defaultDateRange();
    setSelectedCompetitors(null);
    setFrom(defaults.from);
    setTo(defaults.to);
    setTypes(["preco", "disponibilidade"]);
    setDirection("ambos");
    setMinVariationValue("");
    setMinVariationUnit("reais");
    setStatus("ambos");
    setSearch("");
    router.push("/admin/relatorios");
  }

  const allSelected = selectedCompetitors === null;

  return (
    <form onSubmit={handleSubmit} className="print:hidden flex flex-col gap-4 rounded-lg border border-surface-border bg-surface p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Concorrentes</span>
          <div className="flex flex-wrap gap-2">
            {competitors.map((c) => {
              const checked = allSelected || (selectedCompetitors?.includes(c.id) ?? false);
              return (
                <label key={c.id} className="flex items-center gap-1.5 text-sm text-foreground">
                  <input type="checkbox" checked={checked} onChange={() => toggleCompetitor(c.id)} />
                  {c.abbreviation}
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Período</span>
          <div className="flex items-center gap-2">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
            <span className="text-xs text-muted">até</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
          </div>
          {(from || to) && (
            <button type="button" onClick={clearDateRange} className="w-fit text-xs text-muted hover:underline">
              Remover filtro de período
            </button>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Tipo de mudança</span>
          <div className="flex gap-3">
            <label className="flex items-center gap-1.5 text-sm text-foreground">
              <input type="checkbox" checked={types.includes("preco")} onChange={() => toggleType("preco")} />
              Preço
            </label>
            <label className="flex items-center gap-1.5 text-sm text-foreground">
              <input type="checkbox" checked={types.includes("disponibilidade")} onChange={() => toggleType("disponibilidade")} />
              Disponibilidade
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Direção da mudança</span>
          <div className="flex gap-3">
            {(["ambos", "aumento", "reducao"] as const).map((d) => (
              <label key={d} className="flex items-center gap-1.5 text-sm text-foreground">
                <input type="radio" name="direction" checked={direction === d} onChange={() => setDirection(d)} />
                {d === "ambos" ? "Ambas" : d === "aumento" ? "Aumento" : "Redução"}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Variação mínima (opcional)</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step="any"
              value={minVariationValue}
              onChange={(e) => setMinVariationValue(e.target.value)}
              placeholder="vazio = sem filtro"
              className={`${inputClass} w-36`}
            />
            <select value={minVariationUnit} onChange={(e) => setMinVariationUnit(e.target.value as "reais" | "percent")} className={inputClass}>
              <option value="reais">R$</option>
              <option value="percent">%</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Status do imóvel (atual)</span>
          <div className="flex gap-3">
            {(["ambos", "ativo", "possivelmente_vendido"] as const).map((s) => (
              <label key={s} className="flex items-center gap-1.5 text-sm text-foreground">
                <input type="radio" name="status" checked={status === s} onChange={() => setStatus(s)} />
                {s === "ambos" ? "Ambos" : s === "ativo" ? "Ativo" : "Possiv. vendido"}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="search" className="text-xs font-medium text-muted">
            Buscar referência do imóvel
          </label>
          <input id="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ex: 1006" className={inputClass} />
        </div>
      </div>

      {excludesAvailability && (
        <p className="text-xs text-amber-600 dark:text-amber-400" role="status">
          Direção específica ou variação mínima preenchida — mudanças de disponibilidade (sem preço pra comparar) ficam excluídas do resultado.
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="w-fit rounded-md bg-signal px-4 py-2 text-sm font-semibold text-signal-on hover:opacity-90"
        >
          Aplicar filtros
        </button>
        <button type="button" onClick={handleClear} className="text-sm text-muted hover:underline">
          Limpar filtros
        </button>
      </div>
    </form>
  );
}
