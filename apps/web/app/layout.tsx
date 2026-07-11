import type { Metadata } from "next";
import localFont from "next/font/local";
import { IBM_Plex_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

// BR Sonoma — fonte de marca do Q&A Imob, substitui Manrope (corpo/UI) E
// Fraunces (título/saudação): uma família só, cobrindo toda a hierarquia
// tipográfica do produto (--font-display, em globals.css, aponta pra esta
// mesma variável — não existe mais uma segunda família só pra títulos).
// Arquivos com licença de uso web confirmada, em apps/web/public/fonts/.
// IBM Plex Mono continua isolada pros números tabulares, sem mudança.
const brSonoma = localFont({
  src: [
    { path: "../public/fonts/BRSonoma-Thin-BF654c45255ffe0.otf", weight: "100", style: "normal" },
    { path: "../public/fonts/BRSonoma-ThinItalic-BF654c45268d3f9.otf", weight: "100", style: "italic" },
    { path: "../public/fonts/BRSonoma-ExtraLight-BF654c45265af8d.otf", weight: "200", style: "normal" },
    { path: "../public/fonts/BRSonoma-ExtraLightItalic-BF654c4525a5046.otf", weight: "200", style: "italic" },
    { path: "../public/fonts/BRSonoma-Light-BF654c452608e0f.otf", weight: "300", style: "normal" },
    { path: "../public/fonts/BRSonoma-LightItalic-BF654c45266aa83.otf", weight: "300", style: "italic" },
    { path: "../public/fonts/BRSonoma-Regular-BF654c45266c042.otf", weight: "400", style: "normal" },
    { path: "../public/fonts/BRSonoma-RegularItalic-BF654c452681c11.otf", weight: "400", style: "italic" },
    { path: "../public/fonts/BRSonoma-Medium-BF654c45266edd1.otf", weight: "500", style: "normal" },
    { path: "../public/fonts/BRSonoma-MediumItalic-BF654c45267d45f.otf", weight: "500", style: "italic" },
    { path: "../public/fonts/BRSonoma-SemiBold-BF654c45268c340.otf", weight: "600", style: "normal" },
    { path: "../public/fonts/BRSonoma-SemiBoldItalic-BF654c452696350.otf", weight: "600", style: "italic" },
    { path: "../public/fonts/BRSonoma-Bold-BF654c4526823f5.otf", weight: "700", style: "normal" },
    { path: "../public/fonts/BRSonoma-BoldItalic-BF654c4525c9c27.otf", weight: "700", style: "italic" },
    { path: "../public/fonts/BRSonoma-Black-BF654c4525506bf.otf", weight: "900", style: "normal" },
    { path: "../public/fonts/BRSonoma-BlackItalic-BF654c45268988e.otf", weight: "900", style: "italic" },
  ],
  variable: "--font-body",
  display: "swap",
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
      className={`${brSonoma.variable} ${plexMono.variable} h-full antialiased ${isDark ? "dark" : ""}`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
