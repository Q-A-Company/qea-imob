import * as cheerio from "cheerio";

// Tags que não carregam nenhuma informação estrutural útil para localizar
// cards de imóveis (referência/preço/link) — cortadas para reduzir tokens
// enviados à IA. Mantemos nav/header/footer de propósito: em alguns sites o
// controle de paginação vive nesses elementos.
const STRIP_TAGS = [
  "script",
  "style",
  "noscript",
  "svg",
  "link",
  "meta",
  "head",
  "iframe",
  "canvas",
  "video",
  "audio",
  "source",
];

// Atributos puramente visuais/comportamentais — não ajudam a IA a identificar
// um seletor CSS estável e só consomem tokens.
const STRIP_ATTRS = ["style", "onclick", "onload", "onerror", "loading", "decoding"];

const MAX_CHARS = 120_000;

export interface CleanHtmlResult {
  html: string;
  originalLength: number;
  cleanedLength: number;
  truncated: boolean;
}

export function cleanListingHtml(rawHtml: string): CleanHtmlResult {
  const $ = cheerio.load(rawHtml);

  $(STRIP_TAGS.join(",")).remove();

  $("*")
    .contents()
    .each((_, node) => {
      if (node.type === "comment") {
        $(node).remove();
      }
    });

  $("*").each((_, el) => {
    const $el = $(el);
    STRIP_ATTRS.forEach((attr) => $el.removeAttr(attr));

    // data: URIs em imagens (base64) podem ter dezenas de KB e não ajudam a
    // localizar seletores — substitui por um placeholder curto.
    for (const attr of ["src", "srcset"] as const) {
      const value = $el.attr(attr);
      if (value?.startsWith("data:")) {
        $el.attr(attr, "data:truncated");
      }
    }
  });

  let html = ($("body").html() ?? $.html()).replace(/[ \t]{2,}/g, " ").trim();

  const originalLength = rawHtml.length;
  let truncated = false;
  if (html.length > MAX_CHARS) {
    html = html.slice(0, MAX_CHARS);
    truncated = true;
  }

  return { html, originalLength, cleanedLength: html.length, truncated };
}
