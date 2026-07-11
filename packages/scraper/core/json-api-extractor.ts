import type { JsonApiSiteConfig } from "../ai/site-config-schema.js";
import type { ExtractedProperty } from "./types.js";
import { normalizeExternalId } from "./text-utils.js";

export interface JsonApiExtractionResult {
  properties: ExtractedProperty[];
  pagesFetched: number;
  itemsSkippedMissingField: number;
  stoppedEarlyDueToError: boolean;
}

const USER_AGENT = "Q&A Imob Bot/1.0 (contato@qeacompany.com.br)";
const MAX_PAGES = 500; // trava de segurança contra loop infinito se total_field estiver errado
// 5 tentativas com backoff 500ms/1s/2s/4s/8s (~15.5s de espera total antes de
// desistir de uma página) — calibrado depois de observar instabilidade real
// no servidor da sentineliesobral.com.br que durou mais que alguns segundos
// mas se resolveu sozinha em poucos minutos (ver packages/scraper/README.md).
const MAX_RETRIES = 5;
const RETRY_BASE_DELAY_MS = 500;
// Espaçamento entre páginas bem-sucedidas. Sem isso, um catálogo grande
// (ex: 118 páginas) dispara dezenas de requisições em sequência rápida —
// na prática isso derrubou o servidor da sentineliesobral.com.br por volta
// da página 60-77 de forma consistente (não era timeout/rede do nosso lado,
// era o backend deles sob carga). Ver packages/scraper/README.md.
const DELAY_BETWEEN_PAGES_MS = 400;

// Suporta caminhos aninhados com "." (ex: "response.docs") — necessário
// pra APIs que envelopam a lista de itens dentro de um objeto (ex: Veleiros:
// { response: { docs: [...], numFound: N } }), não só no nível raiz.
function getField(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Timeout + backoff exponencial: uma página com erro transitório (500,
// rate limit, timeout de rede) não pode derrubar a extração inteira e
// perder as páginas já coletadas — só desiste depois de MAX_RETRIES
// tentativas nessa página específica.
async function fetchJsonWithRetry(url: string, init: RequestInit): Promise<Record<string, unknown> | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
      if (res.ok) {
        return (await res.json()) as Record<string, unknown>;
      }
      if (res.status < 500 && res.status !== 429) {
        // erro do cliente (não transitório) — repetir não vai ajudar
        return null;
      }
    } catch {
      // erro de rede/timeout — tenta de novo com backoff
    }

    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
    }
  }

  return null;
}

function buildRequest(config: JsonApiSiteConfig, page: number): { url: string; init: RequestInit } {
  if (config.http_method === "GET") {
    return {
      url: config.endpoint_url.replace("{page}", String(page)),
      init: { method: "GET", headers: { "User-Agent": USER_AGENT, Accept: "application/json" } },
    };
  }

  return {
    url: config.endpoint_url,
    init: {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: (config.request_body_template ?? "{}").replace("{page}", String(page)),
    },
  };
}

export async function extractFromJsonApi(config: JsonApiSiteConfig): Promise<JsonApiExtractionResult> {
  const properties: ExtractedProperty[] = [];
  let itemsSkippedMissingField = 0;
  let page = config.starting_page;
  let pagesFetched = 0;
  let total: number | null = null;
  let stoppedEarlyDueToError = false;

  while (pagesFetched < MAX_PAGES) {
    const { url, init } = buildRequest(config, page);
    const body = await fetchJsonWithRetry(url, init);

    if (body === null) {
      stoppedEarlyDueToError = true;
      break;
    }

    pagesFetched++;

    if (config.total_field && total === null) {
      const totalValue = getField(body, config.total_field);
      total = typeof totalValue === "number" ? totalValue : null;
    }

    const items = getField(body, config.items_field);
    if (!Array.isArray(items) || items.length === 0) break;

    for (const rawItem of items) {
      const item = rawItem as Record<string, unknown>;

      const externalIdValue = getField(item, config.external_id_field);
      const urlValue = getField(item, config.property_url_field);
      if (externalIdValue == null || urlValue == null) {
        itemsSkippedMissingField++;
        continue;
      }

      const isUnavailable = config.price_unavailable_field
        ? getField(item, config.price_unavailable_field) === true
        : false;

      const priceValue = getField(item, config.price_field);
      const price = !isUnavailable && typeof priceValue === "number" ? priceValue : null;

      const suffixValue = config.property_url_suffix_field
        ? getField(item, config.property_url_suffix_field)
        : null;

      // config.reference_code_field pode ser null (sem código legível
      // separado) ou apontar pro MESMO campo de external_id_field (quando
      // ele já é legível, ex: Sentineli) — os dois casos são só uma leitura
      // condicional a mais, sem lógica especial.
      const referenceCodeValue = config.reference_code_field ? getField(item, config.reference_code_field) : null;

      properties.push({
        external_id: normalizeExternalId(String(externalIdValue)),
        reference_code: referenceCodeValue != null ? normalizeExternalId(String(referenceCodeValue)) : null,
        price,
        price_status: price !== null ? "valor" : "sob_consulta",
        url: `${config.property_url_base}${urlValue}${suffixValue != null ? `/${suffixValue}` : ""}`,
      });
    }

    page += config.page_increment;
    if (total !== null && properties.length >= total) break;
    await sleep(DELAY_BETWEEN_PAGES_MS);
  }

  return { properties, pagesFetched, itemsSkippedMissingField, stoppedEarlyDueToError };
}
