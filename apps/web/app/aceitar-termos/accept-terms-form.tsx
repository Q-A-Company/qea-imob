"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { acceptTermsAction } from "@/lib/legal/actions";

// acceptTermsAction redireciona sozinho em caso de sucesso (roleHome) — só
// precisa tratar o caso de erro aqui; não há useActionState/formData
// envolvido, é uma confirmação simples sem campos.
export function AcceptTermsForm() {
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptTermsAction();
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5 text-sm">
        <Link href="/termos" target="_blank" rel="noopener noreferrer" className="text-signal-text hover:underline">
          Termos de Uso ↗
        </Link>
        <Link href="/privacidade" target="_blank" rel="noopener noreferrer" className="text-signal-text hover:underline">
          Política de Privacidade ↗
        </Link>
      </div>

      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-signal"
        />
        Li e aceito os Termos de Uso e a Política de Privacidade
      </label>

      {error && (
        <p className="text-sm text-erro-texto" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleAccept}
        disabled={!checked || isPending}
        className="rounded-md bg-signal px-4 py-2 text-sm font-semibold text-signal-on hover:opacity-90 disabled:opacity-60"
      >
        {isPending ? "Aguarde..." : "Continuar"}
      </button>
    </div>
  );
}
