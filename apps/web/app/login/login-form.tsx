"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { login, type LoginState } from "@/lib/auth/actions";
import { Checkbox } from "@/app/(dashboard)/checkbox";

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

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium text-muted">
            Senha
          </label>
          <Link href="/forgot-password" className="text-xs text-muted hover:underline">
            Esqueci minha senha
          </Link>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-signal"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-muted">
        <Checkbox name="rememberMe" />
        Lembrar de mim!
      </label>

      {state?.error && (
        <p className="text-sm text-erro-texto" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-md bg-signal px-4 py-2 text-sm font-semibold text-signal-on hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
