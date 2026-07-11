"use client";

import { motion } from "motion/react";
import { formatBRL, formatRelativeTime } from "@/lib/format";
import { InfoTooltip } from "../info-tooltip";
import { PropertyReferenceLink } from "../property-reference-link";
import type { FeedItem } from "./get-dashboard-data";

const listVariants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.04 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

function FeedRow({ item }: { item: FeedItem }) {
  return (
    <motion.li variants={itemVariants} className="flex items-center justify-between gap-4 border-b border-surface-border px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{item.competitorName}</p>
        <p className="truncate text-xs text-muted">
          Imóvel <PropertyReferenceLink referenceCode={item.referenceCode} url={item.url} />
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {item.changeType === "added" ? (
          <span className="flex items-center gap-1.5">
            <span className="rounded-full bg-sucesso/15 px-2 py-0.5 font-mono text-xs font-semibold text-sucesso-texto">Adicionado</span>
            <span className="font-mono text-sm font-semibold text-foreground">{formatBRL(item.newPrice)}</span>
          </span>
        ) : item.changeType === "removed" ? (
          <span className="rounded-full bg-erro/15 px-2 py-0.5 font-mono text-xs font-semibold text-erro-texto">Possivelmente vendido</span>
        ) : item.changeType === "reappeared" ? (
          <span className="rounded-full bg-sucesso/15 px-2 py-0.5 font-mono text-xs font-semibold text-sucesso-texto">Reapareceu</span>
        ) : (
          <span className="flex items-center gap-1.5 font-mono text-sm">
            <span className="text-muted line-through">{formatBRL(item.oldPrice)}</span>
            <span className="text-muted">→</span>
            <span className="font-semibold text-signal-text">{formatBRL(item.newPrice)}</span>
          </span>
        )}
        <span className="text-[11px] text-muted">{formatRelativeTime(item.detectedAt)}</span>
      </div>
    </motion.li>
  );
}

// O feed é o elemento central da tela — maior peso visual que KPIs e
// gráfico, não um acessório.
export function ChangesFeed({ feed }: { feed: FeedItem[] }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-surface-border bg-surface">
      <h3 className="flex items-center gap-1.5 border-b border-surface-border px-4 py-3 text-sm font-medium text-muted">
        Últimas mudanças
        <InfoTooltip text="As mudanças de preço, imóveis adicionados/removidos mais recentes, entre todos os concorrentes ativos — mais recente primeiro." />
      </h3>
      {feed.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">Nenhuma mudança detectada nos últimos 7 dias.</p>
      ) : (
        <motion.ul variants={listVariants} className="overflow-y-auto overflow-x-hidden">
          {feed.map((item) => (
            <FeedRow key={item.id} item={item} />
          ))}
        </motion.ul>
      )}
    </div>
  );
}
