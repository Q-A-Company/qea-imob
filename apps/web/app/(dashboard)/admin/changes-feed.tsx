"use client";

import { motion } from "motion/react";
import { formatBRL } from "@/lib/format";
import { colorForCompetitor } from "@/lib/categorical-colors";
import { PropertyReferenceLink } from "../property-reference-link";
import type { PropertyChangeType } from "@/lib/supabase/types";
import type { FeedItem } from "./get-dashboard-data";

const listVariants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.04 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR");
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR");
}

// Reaproveita as MESMAS cores/badges já usados pros change_types em
// report-table.tsx — "Preço" ganha o mesmo tratamento em pill que os outros
// 3 (a referência visual mostra todo status como pill), mas com a cor
// --signal já reservada pra "mudança detectada" nesse produto — não é cor
// nova, é o mesmo latão usado no preço antigo→novo logo abaixo.
function StatusBadge({ changeType }: { changeType: PropertyChangeType }) {
  if (changeType === "price") {
    return <span className="rounded-full bg-signal/15 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-signal-text">Preço</span>;
  }
  if (changeType === "added") {
    return <span className="rounded-full bg-sucesso/15 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-sucesso-texto">Adicionado</span>;
  }
  if (changeType === "removed") {
    return (
      <span className="rounded-full bg-erro/15 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-erro-texto">Possiv. vendido</span>
    );
  }
  return <span className="rounded-full bg-sucesso/15 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-sucesso-texto">Reapareceu</span>;
}

// Nem toda mudança tem os dois preços: 'added' não tem "antes" (o imóvel
// não existia pra esse concorrente); 'removed' não tem "depois" (sumiu);
// 'reappeared' também não tem um "antes" útil (o item ficou invisível, não
// mudou de valor) — os 3 mostram "—" no lado que não existe, sem tentar
// simular um preço que não é real. Só 'price' (mudança de preço de verdade)
// ganha a seta "→", porque só ali existe uma transição de valor real entre
// as duas colunas.
function PriceBefore({ item }: { item: FeedItem }) {
  if (item.changeType === "price" || item.changeType === "removed") {
    return <span className="text-muted line-through">{formatBRL(item.oldPrice)}</span>;
  }
  return <span className="text-muted">—</span>;
}

function PriceAfter({ item }: { item: FeedItem }) {
  if (item.changeType === "removed") {
    return <span className="text-muted">—</span>;
  }
  if (item.changeType === "price") {
    return (
      <span className="font-semibold text-signal-text">
        <span className="mr-1 text-muted">→</span>
        {formatBRL(item.newPrice)}
      </span>
    );
  }
  return <span className="font-semibold text-foreground">{formatBRL(item.newPrice)}</span>;
}

function CompetitorBadge({ item }: { item: FeedItem }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorForCompetitor(item.competitorId) }} aria-hidden />
      <span className="font-mono text-xs font-semibold text-foreground">{item.competitorAbbreviation}</span>
    </span>
  );
}

// O feed é o elemento central da tela — maior peso visual que KPIs e
// gráfico, não um acessório.
//
// @container (não sm:) — o feed mora numa coluna estreita do grid do
// Painel (ao lado da coluna de gráficos), então mesmo numa tela larga o
// espaço REAL disponível pra essa tabela pode ser menor que o breakpoint
// de viewport sugeriria (sm: nunca desativava, mesmo com a tabela
// visualmente espremida — a viewport inteira está larga, só o container
// dela não está). @container mede a largura de verdade do próprio
// elemento, não da tela.
//
// @[800px]: NÃO é o antigo limiar de viewport (640px) reaproveitado — foi
// exatamente isso que causou rolagem horizontal mesmo com o container
// query funcionando certo (a coluna do feed em telas de 1280–1366px de
// largura, muito comuns, fica entre ~667–724px: passava do limiar de
// 640px e ativava a tabela, que precisa de ~772px pras 6 colunas). 800px
// = soma real da largura mínima de cada coluna (maior entre header e
// dado real, com padding px-4 de cada <td>) + ~28px de margem — cálculo
// completo documentado na conversa que introduziu esse valor.
export function ChangesFeed({ feed }: { feed: FeedItem[] }) {
  return (
    <div className="@container flex h-full flex-col overflow-hidden rounded-lg border border-surface-border bg-surface">
      <h3 className="border-b border-surface-border px-4 py-3 text-sm font-medium text-muted">Últimas mudanças</h3>
      {feed.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">Nenhuma mudança detectada nos últimos 7 dias.</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <motion.ul variants={listVariants} className="flex flex-col gap-2 p-3 @[800px]:hidden">
            {feed.map((item) => (
              <motion.li key={item.id} variants={itemVariants} className="rounded-lg border border-surface-border bg-background p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <CompetitorBadge item={item} />
                  <StatusBadge changeType={item.changeType} />
                </div>
                <div className="mb-1.5 font-mono text-xs text-foreground">
                  <PropertyReferenceLink
                    referenceCode={item.referenceCode}
                    url={item.url}
                    status={item.status}
                    attributes={item.attributes}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-1 font-mono text-xs">
                    <PriceBefore item={item} />
                    <PriceAfter item={item} />
                  </span>
                  <span className="shrink-0 text-right text-[11px] text-muted">
                    {formatDate(item.detectedAt)}
                    <br />
                    {formatTime(item.detectedAt)}
                  </span>
                </div>
              </motion.li>
            ))}
          </motion.ul>

          <div className="hidden overflow-x-auto @[800px]:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border text-left text-xs text-muted">
                  <th className="px-4 py-2 font-medium">Imóvel</th>
                  <th className="px-4 py-2 font-medium">Concorrente</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Preço antes</th>
                  <th className="px-4 py-2 font-medium">Preço depois</th>
                  <th className="px-4 py-2 font-medium">Data/hora</th>
                </tr>
              </thead>
              <motion.tbody variants={listVariants}>
                {feed.map((item) => (
                  <motion.tr key={item.id} variants={itemVariants} className="border-b border-surface-border last:border-b-0">
                    <td className="px-4 py-2.5 font-mono text-xs text-foreground">
                      <PropertyReferenceLink
                        referenceCode={item.referenceCode}
                        url={item.url}
                        status={item.status}
                        attributes={item.attributes}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <CompetitorBadge item={item} />
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge changeType={item.changeType} />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      <PriceBefore item={item} />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      <PriceAfter item={item} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted">
                      {formatDate(item.detectedAt)}
                      <br />
                      {formatTime(item.detectedAt)}
                    </td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
