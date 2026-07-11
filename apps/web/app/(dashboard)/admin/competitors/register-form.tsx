"use client";

import { useActionState, useState, useTransition } from "react";
import {
  registerCompetitorAction,
  confirmSiteConfigAction,
  discardSiteConfigAction,
  type RegisterCompetitorState,
} from "@/lib/competitors/actions";
import { ALLOWED_POLLING_INTERVALS } from "@/lib/competitors/constants";

const initialState: RegisterCompetitorState = {};

const inputClass =
  "rounded-md border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-signal";

function coverageLabel(cardsFound: number, totalListingsHint: number | null): string {
  if (totalListingsHint === null) return `${cardsFound} imóveis capturados (total do site desconhecido)`;
  const pct = totalListingsHint === 0 ? 0 : Math.round((cardsFound / totalListingsHint) * 100);
  return `${cardsFound} de ${totalListingsHint} imóveis capturados (${pct}%)`;
}

// Fluxo de 2 telas: cadastra + aprende via IA (sem ativar) → mostra a
// prévia de cobertura/confiança/warnings → Admin confirma (ativa) ou
// descarta (apaga e tenta de novo). Pedido explicitamente depois de já
// termos visto, na prática, sites com cobertura muito baixa (Débora 0%,
// CEW 3,7%) — ativar sem revisão arriscava publicar um config ruim
// silenciosamente.
export function RegisterCompetitorForm() {
  const [state, formAction, pending] = useActionState(registerCompetitorAction, initialState);
  const [isResolving, startTransition] = useTransition();
  const [resolvedSiteConfigId, setResolvedSiteConfigId] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<"confirmed" | "discarded" | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // state.learning fica "preso" no retorno da última chamada de
  // registerCompetitorAction até o form ser submetido de novo — comparar
  // siteConfigId (não um boolean solto) garante que um novo cadastro sempre
  // mostra sua própria prévia, mesmo que o anterior já tenha sido resolvido.
  const pendingReview = state.learning && state.learning.siteConfigId !== resolvedSiteConfigId;
  const justResolved = state.learning && state.learning.siteConfigId === resolvedSiteConfigId && lastAction !== null;

  function handleConfirm() {
    if (!state.learning) return;
    setResolveError(null);
    const { siteConfigId } = state.learning;
    startTransition(async () => {
      const result = await confirmSiteConfigAction(siteConfigId);
      if (result.error) setResolveError(result.error);
      else {
        setResolvedSiteConfigId(siteConfigId);
        setLastAction("confirmed");
      }
    });
  }

  function handleDiscard() {
    if (!state.learning) return;
    setResolveError(null);
    const { competitorId, siteConfigId } = state.learning;
    startTransition(async () => {
      const result = await discardSiteConfigAction(competitorId);
      if (result.error) setResolveError(result.error);
      else {
        setResolvedSiteConfigId(siteConfigId);
        setLastAction("discarded");
      }
    });
  }

  if (pendingReview && state.learning) {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-surface-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">
          Concorrente cadastrado — revise antes de ativar (estratégia {state.learning.strategy === "html_css" ? "HTML" : "API JSON"})
        </h2>
        <div className="rounded-md border border-surface-border bg-background p-3 text-sm">
          <p className="text-foreground">{coverageLabel(state.learning.cardsFound, state.learning.totalListingsHint)}</p>
          <p className="mt-0.5 text-muted">
            Confiança: {Math.round(state.learning.confidenceScore * 100)}%
            {!state.learning.externalIdSanityOk && " · referência do imóvel pode não ser estável, considere revisar"}
          </p>
          {state.learning.warnings.length > 0 && (
            <ul className="mt-1.5 list-inside list-disc text-xs text-muted">
              {state.learning.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>

        {state.learning.paginationDetectedWithoutTotal && (
          <p className="rounded-md border border-erro/30 bg-erro/10 px-3 py-2 text-xs text-erro-texto" role="alert">
            Não sabemos o total real de imóveis do site, mas ele tem paginação (mais páginas além da 1ª) — esta prévia
            mostra só uma amostra da página 1, não o catálogo inteiro. A checagem completa só acontece depois de
            confirmar e rodar &quot;Verificar agora&quot; ou aguardar o próximo ciclo automático.
          </p>
        )}

        {resolveError && (
          <p className="text-sm text-erro-texto" role="alert">
            {resolveError}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isResolving}
            className="rounded-md bg-signal px-4 py-2 text-sm font-semibold text-signal-on hover:opacity-90 disabled:opacity-60"
          >
            {isResolving ? "Aguarde..." : "Confirmar e ativar"}
          </button>
          <button
            type="button"
            onClick={handleDiscard}
            disabled={isResolving}
            className="text-sm text-muted hover:underline disabled:opacity-60"
          >
            Descartar e tentar de novo
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-surface-border bg-surface p-5">
      <h2 className="text-sm font-semibold text-foreground">Cadastrar concorrente</h2>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="name" className="text-xs font-medium text-muted">
            Nome
          </label>
          <input id="name" name="name" required className={inputClass} placeholder="Imobiliária Exemplo" />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="abbreviation" className="text-xs font-medium text-muted">
            Abreviação
          </label>
          <input id="abbreviation" name="abbreviation" required maxLength={6} className={`${inputClass} w-24 uppercase`} placeholder="EX" />
        </div>

        <div className="flex flex-1 min-w-48 flex-col gap-1">
          <label htmlFor="listingUrl" className="text-xs font-medium text-muted">
            URL da listagem
          </label>
          <input id="listingUrl" name="listingUrl" type="url" required className={inputClass} placeholder="https://exemplo.com.br/imoveis" />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="pollingIntervalMinutes" className="text-xs font-medium text-muted">
            Intervalo
          </label>
          <select id="pollingIntervalMinutes" name="pollingIntervalMinutes" defaultValue={5} required className={inputClass}>
            {ALLOWED_POLLING_INTERVALS.map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-signal px-4 py-2 text-sm font-semibold text-signal-on hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Cadastrando e aprendendo o site..." : "Cadastrar"}
        </button>
      </div>

      {pending && (
        <p className="text-xs text-muted" role="status">
          Isso chama a IA pra aprender a estrutura do site — pode levar alguns segundos.
        </p>
      )}

      {state.error && (
        <p className="text-sm text-erro-texto" role="alert">
          {state.error}
        </p>
      )}

      {state.learningError && (
        <p className="text-sm text-erro-texto" role="alert">
          {state.learningError}
        </p>
      )}

      {justResolved && lastAction === "confirmed" && (
        <p className="text-sm text-sucesso-texto" role="status">
          Concorrente ativado — checagens de preço vão rodar normalmente a partir de agora.
        </p>
      )}
      {justResolved && lastAction === "discarded" && (
        <p className="text-sm text-muted" role="status">
          Cadastro descartado. Pode tentar de novo, com outra URL ou ajustando o intervalo.
        </p>
      )}
    </form>
  );
}
