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
        <p className="text-sm text-neutral-700 dark:text-neutral-300">{state.message}</p>
        <Link href="/login" className="text-sm text-neutral-500 hover:underline dark:text-neutral-400">
          Voltar para o login
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-800"
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
        className="mt-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-60 dark:bg-neutral-50 dark:text-neutral-900"
      >
        {pending ? "Enviando..." : "Enviar link de recuperação"}
      </button>

      <Link href="/login" className="text-center text-sm text-neutral-500 hover:underline dark:text-neutral-400">
        Voltar para o login
      </Link>
    </form>
  );
}
