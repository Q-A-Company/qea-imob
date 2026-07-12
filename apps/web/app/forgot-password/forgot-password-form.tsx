"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordRecoveryAction, type RequestPasswordRecoveryState } from "@/lib/auth/recovery-actions";

const initialState: RequestPasswordRecoveryState = {};

// Mesma mensagem sempre aparece em state.message, nunca state.error, exceto
// quando o e-mail digitado nem parece um e-mail (validação de formato, não
// de existência — essa distinção é segura, não revela nada sobre contas
// cadastradas).
export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordRecoveryAction, initialState);

  if (state.message) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-foreground">{state.message}</p>
        <Link href="/login" className="text-sm text-muted hover:underline">
          Voltar para o login
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium text-muted">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-signal"
        />
      </div>

      {state.error && (
        <p className="text-sm text-erro-texto" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-md bg-signal px-4 py-2 text-sm font-semibold text-signal-on hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Enviando..." : "Enviar link de recuperação"}
      </button>

      <Link href="/login" className="text-center text-sm text-muted hover:underline">
        Voltar para o login
      </Link>
    </form>
  );
}
