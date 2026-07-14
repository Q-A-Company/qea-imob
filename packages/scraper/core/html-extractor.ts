import * as cheerio from "cheerio";
import type { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import type { HtmlCssSiteConfig } from "../ai/site-config-schema.js";
import type { ExtractedProperty } from "./types.js";
import { normalizeExternalId } from "./text-utils.js";
import { parsePriceBR } from "./price-parser.js";

export interface HtmlExtractionResult {
  properties: ExtractedProperty[];
  cardsFound: number;
  cardsWithoutExternalId: number;
  cardsWithoutPrice: number;
}

function readField(
  $card: Cheerio<AnyNode>,
  $: CheerioAPI,
  field: { selector: string; attribute: "text" | "href" | "data"; data_attribute: string | null }
): string | null {
  const $target = field.selector ? $card.find(field.selector) : $card;
  if ($target.length === 0) return null;

  let raw: string | undefined;
  if (field.attribute === "text") {
    raw = $target.first().text();
  } else if (field.attribute === "href") {
    raw = $target.first().attr("href");
  } else {
    raw = field.data_attribute ? $target.first().attr(field.data_attribute) : undefined;
  }

  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

function resolveUrl(raw: string, baseUrl: string): string {
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return raw;
  }
}

export function extractFromHtml(
  html: string,
  config: HtmlCssSiteConfig,
  listingUrl: string
): HtmlExtractionResult {
  const $ = cheerio.load(html);
  const cards = $(config.card_selector);

  const properties: ExtractedProperty[] = [];
  let cardsWithoutExternalId = 0;
  let cardsWithoutPrice = 0;

  cards.each((_, el) => {
    const $card = $(el);

    const externalId = readField($card, $, config.external_id);
    if (!externalId) {
      cardsWithoutExternalId++;
      return;
    }

    const rawPrice = readField($card, $, config.price);
    const rawUrl = readField($card, $, config.property_url);
    if (!rawUrl) return;

    // config.reference_code pode ser null (site sem nenhum código visível
    // identificado durante o aprendizado) — nesse caso nem tenta ler, fica
    // null pra todo imóvel deste concorrente. Quando o seletor existe mas
    // não bate neste card específico, readField já devolve null sozinho.
    const rawReferenceCode = config.reference_code ? readField($card, $, config.reference_code) : null;

    // attributes — camada 3 de identificação de imóvel removido sem
    // reference_code (ver text-utils.ts extractLabelFromUrl pra camada 1;
    // camada 2 de foto foi removida — decisão do usuário de não guardar
    // mais imagem nenhuma). `config.attributes` pode ser undefined pra
    // site_configs gravados antes dessa mudança (a chave nem existe no
    // jsonb) — daí o `?.` em vez de acesso direto, mesmo motivo de
    // optional() no schema (site-config-schema.ts).
    const attributesConfig = config.attributes;
    const rawBairro = attributesConfig?.bairro ? readField($card, $, attributesConfig.bairro) : null;
    const rawQuartos = attributesConfig?.quartos ? readField($card, $, attributesConfig.quartos) : null;
    const rawArea = attributesConfig?.area ? readField($card, $, attributesConfig.area) : null;
    const attributes = rawBairro || rawQuartos || rawArea ? { bairro: rawBairro, quartos: rawQuartos, area: rawArea } : null;

    const isSobConsulta =
      rawPrice !== null &&
      config.price.sob_consulta_markers.some((marker) => rawPrice.toLowerCase().includes(marker.toLowerCase()));

    let price: number | null = null;
    let priceStatus: "valor" | "sob_consulta" = "sob_consulta";

    if (rawPrice && !isSobConsulta) {
      price = parsePriceBR(rawPrice);
      priceStatus = price !== null ? "valor" : "sob_consulta";
    }

    if (priceStatus === "sob_consulta" && !isSobConsulta && rawPrice === null) {
      cardsWithoutPrice++;
    }

    properties.push({
      external_id: normalizeExternalId(externalId),
      reference_code: rawReferenceCode ? normalizeExternalId(rawReferenceCode) : null,
      price,
      price_status: priceStatus,
      url: resolveUrl(rawUrl, listingUrl),
      attributes,
    });
  });

  return {
    properties,
    cardsFound: cards.length,
    cardsWithoutExternalId,
    cardsWithoutPrice,
  };
}
