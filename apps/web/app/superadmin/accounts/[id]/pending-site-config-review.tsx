"use client";

import { useState, useTransition } from "react";
import { confirmSiteConfigActionForSuperAdmin, discardSiteConfigActionForSuperAdmin } from "@/lib/competitors/actions";
import type { PendingSiteConfig } from "./get-pending-site-configs";

const STRATEGY_LABEL: Record<PendingSiteConfig["strategy"], string> = {
  html_css: "HTML/CSS",
  json_api: "API JSON",
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR");
}

// Aprovar sempre ativa o site_config. Descartar tem DOIS comportamentos
// diferentes dependendo da origem (ver discardSiteConfigActionForSuperAdmin
// em lib/competitors/actions.ts, que decide sozinho a partir da version):
// v1 (cadastro recém-criado, nunca teve nada ativo) apaga o concorrente
// inteiro; v2+ (recalibração de um concorrente que já está ativo, com
// histórico real) rejeita só essa versão pendente, mantendo o concorrente e
// a versão ativa anterior intactos. O rótulo do botão abaixo reflete qual
// dos dois vai acontecer, pra não pedir confirmação errada ao SuperAdmin.
export function PendingSiteConfigReview({ accountId, configs }: { accountId: string; configs: PendingSiteConfig[] }) {
  const [items, setItems] = useState(configs);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm(config: PendingSiteConfig) {
    setError(null);
    setPendingId(config.id);
    startTransition(async () => {
      const result = await confirmSiteConfigActionForSuperAdmin(config.id, accountId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setItems((current) => current.filter((c) => c.id !== config.id));
    });
  }

  function handleDiscard(config: PendingSiteConfig) {
    setError(null);
    setPendingId(config.id);
    startTransition(async () => {
      const result = await discardSiteConfigActionForSuperAdmin(config.id, accountId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setItems((current) => current.filter((c) => c.id !== config.id));
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-erro/30 bg-erro/5 p-4">
      <p className="text-sm font-medium text-erro-texto">
        {items.length} {items.length === 1 ? "configuração de site aguardando revisão" : "configurações de site aguardando revisão"}
      </p>
      {error && (
        <p className="text-xs text-erro-texto" role="alert">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {items.map((config) => (
          <li key={config.id} className="flex flex-col gap-2 rounded-md border border-surface-border bg-surface p-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <p className="text-sm font-medium text-foreground">
                {config.competitorName} <span className="text-xs font-normal text-muted">v{config.version}</span>
              </p>
              <span className="text-xs text-muted">{formatDateTime(config.createdAt)}</span>
            </div>
            <p className="text-xs text-muted">
              Estratégia: {STRATEGY_LABEL[config.strategy]} · Confiança:{" "}
              {config.confidenceScore !== null ? `${Math.round(config.confidenceScore * 100)}%` : "não informada"}
            </p>
            {config.warnings.length > 0 && (
              <ul className="list-disc pl-4 text-xs text-muted">
                {config.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            {config.version > 1 && (
              <p className="text-xs text-muted">
                Recalibração de um concorrente já ativo — descartar rejeita só esta versão, sem apagar o concorrente nem o
                histórico.
              </p>
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleConfirm(config)}
                disabled={isPending}
                className="rounded-md border border-sucesso/40 bg-sucesso/10 px-3 py-1.5 text-xs font-medium text-sucesso-texto hover:bg-sucesso/15 disabled:opacity-40"
              >
                {isPending && pendingId === config.id ? "Aguarde..." : "Aprovar"}
              </button>
              <button
                type="button"
                onClick={() => handleDiscard(config)}
                disabled={isPending}
                className="rounded-md border border-erro/40 bg-erro/10 px-3 py-1.5 text-xs font-medium text-erro-texto hover:bg-erro/15 disabled:opacity-40"
              >
                {isPending && pendingId === config.id
                  ? "Aguarde..."
                  : config.version === 1
                    ? "Descartar concorrente"
                    : "Rejeitar recalibração"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
