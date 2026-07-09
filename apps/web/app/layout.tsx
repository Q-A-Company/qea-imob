import type { Metadata } from "next";
import { Manrope, IBM_Plex_Mono, Fraunces } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-numeric",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
});

// Serifada de destaque, só para títulos/saudação — contraste de caráter
// contra a Manrope (corpo) e a IBM Plex Mono (números). Variável, com
// personalidade (detalhes "wonky"), não uma serifada de sistema genérica.
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Q&A Imob",
  description: "Monitoramento de preços de concorrentes imobiliários",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Tema decidido no servidor via cookie, não por script bloqueante no
  // cliente — duas tentativas de script anti-flash (raw <script>, depois
  // next/script beforeInteractive) esbarraram no mesmo warning do React 19
  // ("scripts inside React components are never executed when rendering on
  // the client"), apesar de seguir o padrão documentado do Next.js à risca
  // nas duas vezes. Em vez de insistir num terceiro script, elimina a causa:
  // sem <script> nenhum na árvore, servidor e cliente renderizam a mesma
  // classe desde o primeiro paint, sem flash e sem mismatch de hidratação
  // (não precisa mais de suppressHydrationWarning).
  //
  // Escuro é o padrão do produto — só cai pra claro se o cookie disser
  // "light" explicitamente (usuário já trocou antes, ver theme-toggle.tsx).
  const cookieStore = await cookies();
  const isDark = cookieStore.get("theme")?.value !== "light";

  return (
    <html
      lang="pt-BR"
      className={`${manrope.variable} ${plexMono.variable} ${fraunces.variable} h-full antialiased ${isDark ? "dark" : ""}`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
