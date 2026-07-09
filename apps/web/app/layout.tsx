import type { Metadata } from "next";
import { Manrope, IBM_Plex_Mono, Fraunces } from "next/font/google";
import Script from "next/script";
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

// Script síncrono e bloqueante, roda antes do primeiro paint — evita flash
// do tema errado. React 19 avisa/desaconselha <script> bruto via JSX
// ("scripts inside React components are never executed when rendering on
// the client") — o jeito correto no Next.js é next/script com
// strategy="beforeInteractive", que injeta no <head> gerado e GARANTE
// execução antes da hidratação (diferente das outras estratégias do
// next/script, que realmente adiam). Não precisa mais de <head> manual.
//
// Escuro é o padrão do produto, não o do sistema operacional — só cai pra
// claro se o usuário já escolheu isso explicitamente antes (localStorage).
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var dark = stored ? stored === "dark" : true;
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${manrope.variable} ${plexMono.variable} ${fraunces.variable} h-full antialiased`}
      // O script acima muda a classe do <html> antes do React hidratar —
      // sem isso, React vê o mismatch (SSR não tem "dark", DOM real tem) e
      // acusa erro de hidratação (aparecia como badge "1 Issue" no dev).
      // É exatamente o padrão documentado pelo Next.js/next-themes pra
      // scripts anti-flash de tema.
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        {children}
      </body>
    </html>
  );
}
