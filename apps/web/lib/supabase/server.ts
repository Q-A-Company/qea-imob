import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

// 7 dias — decisão do usuário pro checkbox "Lembrar de mim" (login-form.tsx).
const REMEMBER_ME_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

// options.rememberMe só é passado pela Server Action de login (lib/auth/actions.ts)
// — todo outro call site deste createClient() (a imensa maioria) continua
// chamando sem argumento, comportamento 100% inalterado. true força os
// cookies de sessão recém-escritos (o próprio signInWithPassword do login
// dispara isso) a durarem 7 dias; false remove maxAge/expires, virando
// cookie de sessão do navegador (expira ao fechar o navegador de verdade —
// ressalva: alguns navegadores restauram abas/sessão ao reabrir, o que
// contorna esse comportamento; é a mesma limitação de qualquer "lembrar de
// mim" baseado em cookie de sessão, não é bug nosso). Limitação conhecida,
// não resolvida aqui: um refresh de token automático numa página futura
// usa createClient() sem esse parâmetro, então pode reescrever o cookie com
// as opções padrão da lib em vez de preservar a escolha original — undefined
// (padrão) não mexe em nada, só ganha efeito quando true/false é passado
// explicitamente.
export async function createClient(options?: { rememberMe?: boolean }) {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options: cookieOptions }) => {
              if (options?.rememberMe === true) {
                cookieStore.set(name, value, { ...cookieOptions, maxAge: REMEMBER_ME_MAX_AGE_SECONDS });
              } else if (options?.rememberMe === false) {
                const sessionOnly = { ...cookieOptions };
                delete sessionOnly.maxAge;
                delete sessionOnly.expires;
                cookieStore.set(name, value, sessionOnly);
              } else {
                cookieStore.set(name, value, cookieOptions);
              }
            });
          } catch {
            // chamado a partir de um Server Component sem permissão de escrita
            // de cookies — inofensivo quando há um proxy renovando a sessão.
          }
        },
      },
    }
  );
}
