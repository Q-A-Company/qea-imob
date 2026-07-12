"use client";

import { useState } from "react";
import { CheckNowButton } from "./check-now-button";
import { StatusToggle } from "./status-toggle";
import { IntervalSelect } from "./interval-select";
import { ArchiveButton } from "./archive-button";
import { ReactivateButton } from "./reactivate-button";
import { DeleteCompetitorButton } from "./delete-competitor-button";

export interface CompetitorRow {
  id: string;
  name: string;
  abbreviation: string;
  listingUrl: string;
  status: string;
  lastCheckedAt: string | null;
  pollingIntervalMinutes: number;
  // Menor intervalo seguro pra ESTE concorrente (duração média das
  // últimas checagens limpas × 2, ver scraper/core/polling-interval.ts) —
  // desabilita opções abaixo disso no IntervalSelect. 5 (o menor degrau)
  // pra quem ainda não tem checagem limpa nenhuma.
  minPollingIntervalMinutes: number;
}

const STATUS_LABEL: Record<string, string> = { ativo: "Ativo", pausado: "Pausado", erro: "Erro", arquivado: "Arquivado" };

const STATUS_BADGE_CLASS: Record<string, string> = {
  ativo: "border-sucesso/30 bg-sucesso/10 text-sucesso-texto",
  pausado: "border-erro/30 bg-erro/10 text-erro-texto",
  erro: "border-erro/30 bg-erro/10 text-erro-texto",
  // Neutro de propósito — arquivado não é bom nem ruim (diferente de
  // ativo/pausado/erro), é só um estado "fora de operação" reversível.
  arquivado: "border-surface-border bg-background text-muted",
};

function formatDateTime(value: string | null) {
  if (!value) return "Nunca checado";
  return new Date(value).toLocaleString("pt-BR");
}

type FilterTab = "todos" | "ativo" | "pausado" | "erro" | "arquivado";

// Filtro por status em memória (client) — a lista inteira já veio do
// servidor de uma vez (é escopada a UMA conta, não cresce sem limite tipo
// scraper_runs), então não vale a pena buscar de novo a cada clique.
// Melhoria de usabilidade não pedida explicitamente: fica mais útil conforme
// a conta cadastra mais concorrentes; só aparece com >4 cadastrados pra não
// poluir o caso comum (poucos concorrentes).
//
// "Todos" NUNCA inclui arquivados — pedido explícito: arquivado precisa
// sumir da listagem principal, só fica visível na aba "Arquivados"
// dedicada (também condicional, só aparece com ≥1 arquivado, mesmo padrão
// já usado pra "Erro").
export function CompetitorsList({ competitors }: { competitors: CompetitorRow[] }) {
  const [filter, setFilter] = useState<FilterTab>("todos");

  if (competitors.length === 0) {
    return <p className="text-sm text-muted">Nenhum concorrente cadastrado para esta conta ainda.</p>;
  }

  const nonArchived = competitors.filter((c) => c.status !== "arquivado");

  const counts = {
    todos: nonArchived.length,
    ativo: competitors.filter((c) => c.status === "ativo").length,
    pausado: competitors.filter((c) => c.status === "pausado").length,
    erro: competitors.filter((c) => c.status === "erro").length,
    arquivado: competitors.filter((c) => c.status === "arquivado").length,
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "todos", label: `Todos (${counts.todos})` },
    { key: "ativo", label: `Ativos (${counts.ativo})` },
    { key: "pausado", label: `Pausados (${counts.pausado})` },
    ...(counts.erro > 0 ? ([{ key: "erro", label: `Erro (${counts.erro})` }] as const) : []),
    ...(counts.arquivado > 0 ? ([{ key: "arquivado", label: `Arquivados (${counts.arquivado})` }] as const) : []),
  ];

  const filtered = filter === "todos" ? nonArchived : competitors.filter((c) => c.status === filter);

  return (
    <div className="flex flex-col gap-3">
      {competitors.length > 4 && (
        // overflow-x-auto: com 5 abas ("Todos (N)"..."Arquivados (N)") em
        // texto normal, a soma das larguras estoura uma tela de telefone —
        // rola horizontalmente em vez de cortar/quebrar as abas.
        // whitespace-nowrap + shrink-0 em cada aba evita que o texto quebre
        // linha ou que as abas encolham de forma desigual durante o scroll.
        <div className="flex gap-1 overflow-x-auto border-b border-surface-border">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
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
          {filtered.map((competitor) => {
            const isArchived = competitor.status === "arquivado";
            return (
              // Empilhado no mobile (nome no topo, seletor de intervalo em
              // largura total, depois os 3 botões de ação lado a lado num
              // grid de 3 colunas que cabe na tela) — lado a lado numa linha
              // só a partir de `sm`, igual ao layout original. Antes era um
              // único `flex items-center justify-between` sem wrap: o bloco
              // de ações (seletor + 3 botões, `shrink-0`) não tinha pra onde
              // encolher/quebrar e estourava a largura da tela num telefone
              // real ("Verific..." cortado na borda).
              <li key={competitor.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
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
                    {/* Resquício do radar aposentado (ver globals.css) — só
                        um ponto que pisca 2x na montagem, não um loop
                        permanente; só faz sentido pra quem está sendo
                        vigiado de verdade agora (ativo + já teve check). */}
                    {competitor.status === "ativo" && competitor.lastCheckedAt && <span className="check-pulse" aria-hidden />}
                    Último check: {formatDateTime(competitor.lastCheckedAt)}
                  </p>
                </div>
                {isArchived ? (
                  <div className="flex items-center gap-2 sm:shrink-0">
                    <ReactivateButton competitorId={competitor.id} />
                    <DeleteCompetitorButton competitorId={competitor.id} competitorName={competitor.name} />
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 sm:shrink-0 sm:flex-row sm:items-start">
                    <IntervalSelect
                      competitorId={competitor.id}
                      minutes={competitor.pollingIntervalMinutes}
                      minMinutes={competitor.minPollingIntervalMinutes}
                    />
                    {/* sm:contents: no mobile é um grid próprio (3 colunas,
                        lado a lado, sem overflow); a partir de `sm` o wrapper
                        "desaparece" do layout e os 3 botões voltam a fluir
                        direto na linha flex do pai, exatamente como antes. */}
                    <div className="grid grid-cols-3 gap-2 sm:contents">
                      <StatusToggle competitorId={competitor.id} status={competitor.status} />
                      <CheckNowButton competitorId={competitor.id} />
                      <ArchiveButton competitorId={competitor.id} />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
