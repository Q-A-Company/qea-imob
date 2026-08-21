import type { Metadata } from "next";
import { Space_Grotesk, Inter, Instrument_Serif, IBM_Plex_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

// Unificação de identidade com o site institucional (qeacompany.com.br) —
// mesmo trio de fontes extraído de lá, substitui BR Sonoma inteira.
// Inter cobre corpo/UI (--font-body); Space Grotesk cobre título/destaque
// (--font-display); Instrument Serif é só o acento itálico pontual dentro
// de headlines (--font-serif — ex: <span className="font-serif italic">),
// nunca um bloco inteiro de texto, mesmo uso que o institucional faz.
// IBM Plex Mono continua isolada pros números tabulares, sem mudança.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-numeric",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
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
      className={`${spaceGrotesk.variable} ${inter.variable} ${instrumentSerif.variable} ${plexMono.variable} h-full antialiased ${isDark ? "dark" : ""}`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
