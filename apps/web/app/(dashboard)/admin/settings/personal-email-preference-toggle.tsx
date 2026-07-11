"use client";

import { useState, useTransition } from "react";
import { updatePersonalEmailPreferenceAction } from "./actions";

// Compartilhado entre /admin/settings (Diretor/T.I, Gerente) e
// /user/settings (Corretor) — a preferência é sobre a própria caixa de
// entrada de quem está vendo a tela, não muda com o cargo. Mesmo padrão de
// componente reaproveitado entre rotas já usado desde a Etapa 11
// (*-content.tsx).
export function PersonalEmailPreferenceToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    const next = !enabled;
    startTransition(async () => {
      const result = await updatePersonalEmailPreferenceAction(next);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEnabled(next);
    });
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-surface-border bg-surface p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">Receber resumo diário no meu e-mail</p>
        <p className="mt-0.5 text-xs text-muted">
          Preferência pessoal — vale só pra você, mesmo que o e-mail esteja ligado pra sua conta.
        </p>
        {error && (
          <p className="mt-1.5 text-xs text-erro-texto" role="alert">
            {error}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className={`shrink-0 rounded-md border px-3 py-1.5 text-sm disabled:opacity-60 ${
          enabled
            ? "border-sucesso/40 bg-sucesso/10 text-sucesso-texto hover:bg-sucesso/15"
            : "border-erro/40 bg-erro/10 text-erro-texto hover:bg-erro/15"
        }`}
      >
        {isPending ? "Aguarde..." : enabled ? "Ligado" : "Desligado"}
      </button>
    </div>
  );
}
