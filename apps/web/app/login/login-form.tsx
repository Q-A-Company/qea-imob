"use client";

import { useActionState, useEffect, useState } from "react";
import { login, type LoginState } from "@/lib/auth/actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  // Resolução de tela só existe no navegador — não tem como o servidor
  // capturar isso sozinho. Campo oculto preenchido via JS antes do submit
  // (a alternativa seria uma chamada separada depois do login bem-sucedido,
  // mas isso arrisca perder o dado se o usuário navegar rápido demais antes
  // dela completar; um campo oculto viaja garantido junto do POST de login).
  const [screenWidth, setScreenWidth] = useState<number | null>(null);
  const [screenHeight, setScreenHeight] = useState<number | null>(null);

  useEffect(() => {
    setScreenWidth(window.screen.width);
    setScreenHeight(window.screen.height);
  }, []);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="screenWidth" value={screenWidth ?? ""} />
      <input type="hidden" name="screenHeight" value={screenHeight ?? ""} />
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

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Senha
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-800"
        />
      </div>

      {state?.error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-60 dark:bg-neutral-50 dark:text-neutral-900"
      >
        {pending ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
