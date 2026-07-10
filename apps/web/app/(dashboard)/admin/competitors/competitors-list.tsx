"use client";

import { useState } from "react";
import { CheckNowButton } from "./check-now-button";
import { StatusToggle } from "./status-toggle";
import { IntervalSelect } from "./interval-select";

export interface CompetitorRow {
  id: string;
  name: string;
  abbreviation: string;
  listingUrl: string;
  status: string;
  lastCheckedAt: string | null;
  pollingIntervalMinutes: number;
}

const STATUS_LABEL: Record<string, string> = { ativo: "Ativo", pausado: "Pausado", erro: "Erro" };

const STATUS_BADGE_CLASS: Record<string, string> = {
  ativo: "border-green-600/30 bg-green-600/10 text-green-600 dark:border-green-400/30 dark:bg-green-400/10 dark:text-green-400",
  pausado: "border-amber-600/30 bg-amber-600/10 text-amber-600 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-400",
  erro: "border-red-500/30 bg-red-500/10 text-red-500 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-400",
};

function formatDateTime(value: string | null) {
  if (!value) return "Nunca checado";
  return new Date(value).toLocaleString("pt-BR");
}

type FilterTab = "todos" | "ativo" | "pausado" | "erro";

// Filtro por status em memória (client) — a lista inteira já veio do
// servidor de uma vez (é escopada a UMA conta, não cresce sem limite tipo
// scraper_runs), então não vale a pena buscar de novo a cada clique.
// Melhoria de usabilidade não pedida explicitamente: fica mais útil conforme
// a conta cadastra mais concorrentes; só aparece com >4 cadastrados pra não
// poluir o caso comum (poucos concorrentes).
export function CompetitorsList({ competitors }: { competitors: CompetitorRow[] }) {
  const [filter, setFilter] = useState<FilterTab>("todos");

  if (competitors.length === 0) {
    return <p className="text-sm text-muted">Nenhum concorrente cadastrado para esta conta ainda.</p>;
  }

  const counts = {
    todos: competitors.length,
    ativo: competitors.filter((c) => c.status === "ativo").length,
    pausado: competitors.filter((c) => c.status === "pausado").length,
    erro: competitors.filter((c) => c.status === "erro").length,
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "todos", label: `Todos (${counts.todos})` },
    { key: "ativo", label: `Ativos (${counts.ativo})` },
    { key: "pausado", label: `Pausados (${counts.pausado})` },
    ...(counts.erro > 0 ? ([{ key: "erro", label: `Erro (${counts.erro})` }] as const) : []),
  ];

  const filtered = filter === "todos" ? competitors : competitors.filter((c) => c.status === filter);

  return (
    <div className="flex flex-col gap-3">
      {competitors.length > 4 && (
        <div className="flex gap-1 border-b border-surface-border">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                filter === tab.key ? "border-signal text-signal-text" : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">Nenhum concorrente nesse filtro.</p>
      ) : (
        <ul className="divide-y divide-surface-border rounded-lg border border-surface-border bg-surface">
          {filtered.map((competitor) => (
            <li key={competitor.id} className="flex items-center justify-between gap-4 px-4 py-3.5">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <span className="shrink-0 rounded bg-background px-1.5 py-0.5 font-mono text-[11px] font-semibold text-signal-text">
                    {competitor.abbreviation}
                  </span>
                  <span className="truncate">{competitor.name}</span>
                </p>
                <p className="mt-1 truncate text-xs text-muted">{competitor.listingUrl}</p>
                <p className="mt-1.5 flex items-center gap-2 text-xs text-muted">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE_CLASS[competitor.status] ?? ""}`}
                  >
                    {STATUS_LABEL[competitor.status] ?? competitor.status}
                  </span>
                  Último check: {formatDateTime(competitor.lastCheckedAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-start gap-2">
                <IntervalSelect competitorId={competitor.id} minutes={competitor.pollingIntervalMinutes} />
                <StatusToggle competitorId={competitor.id} status={competitor.status} />
                <CheckNowButton competitorId={competitor.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
