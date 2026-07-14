import * as cheerio from "cheerio";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { JsonApiSiteConfig } from "./site-config-schema.js";
import type { ExtractedProperty } from "../core/types.js";
import { isAllowedByRobots } from "../core/robots.js";

const USER_AGENT = "Q&A Imob Bot/1.0 (contato@qeacompany.com.br)";
const MODEL = "claude-sonnet-5";

// Bibliotecas/vendors de terceiros que nunca contêm a lógica de busca do
// próprio site — pular poupa requests e tokens.
const SCRIPT_BLOCKLIST = [
  "google",
  "gstatic",
  "facebook",
  "doubleclick",
  "googletagmanager",
  "google-analytics",
  "jsdelivr",
  "cloudflare",
  "jquery",
  "bootstrap",
  "popper",
  "slick",
  "select2",
  "fontawesome",
  "gtag",
  "hotjar",
  "clarity.ms",
  "tiktok",
  "pinterest",
  "intltelinput",
  "tippy",
  "pickr",
  "numeraljs",
  "mask",
];

const ENDPOINT_PATTERN =
  /["'`](\/[a-zA-Z0-9_\-\/]{2,80}(api|search|busca|list|listar|ajax|anuncio|anuncios|imovei|imoveis|propert|resultado)[a-zA-Z0-9_\-\/]{0,40})["'`]/gi;

const PAGE_PARAM_CANDIDATES = ["page", "pagina", "p", "offset"];

// Nomes de parâmetro comuns em APIs de busca de imóveis brasileiras para o
// filtro "tipo de negócio" (venda/aluguel). Muitos endpoints retornam erro
// sem esse filtro — combinamos cada nome com cada segmento da própria URL
// da listagem (ex: "/venda" -> tenta finalidade=venda, tipo=venda, ...) em
// vez de fixar um valor específico, já que o segmento vem da URL real.
const FILTER_PARAM_NAMES = ["finalidade", "tipo", "transacao", "operacao", "negociacao"];

function buildQueryGuesses(listingUrl: string): URLSearchParams[] {
  const url = new URL(listingUrl);
  const segments = url.pathname.split("/").filter(Boolean);
  const guesses: URLSearchParams[] = [];

  for (const segment of segments) {
    for (const paramName of FILTER_PARAM_NAMES) {
      const params = new URLSearchParams();
      params.set(paramName, segment);
      guesses.push(params);
    }
  }

  return guesses;
}

async function findCandidateScriptUrls(listingHtml: string, listingUrl: string): Promise<string[]> {
  const $ = cheerio.load(listingHtml);
  const urls = new Set<string>();

  $("script[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src) return;
    if (SCRIPT_BLOCKLIST.some((needle) => src.toLowerCase().includes(needle))) return;
    try {
      urls.add(new URL(src, listingUrl).toString());
    } catch {
      // src inválido, ignora
    }
  });

  return [...urls].slice(0, 10);
}

async function findCandidateEndpointPaths(scriptUrls: string[]): Promise<string[]> {
  const paths = new Set<string>();

  await Promise.all(
    scriptUrls.map(async (url) => {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return;
        const text = await res.text();
        for (const match of text.matchAll(ENDPOINT_PATTERN)) {
          paths.add(match[1]);
        }
      } catch {
        // script inacessível, ignora
      }
    })
  );

  return [...paths].slice(0, 8);
}

interface TransferStateCacheEntry {
  u?: unknown;
  b?: unknown;
  s?: unknown;
}

// Angular Universal (SSR) embute as respostas HTTP feitas durante a
// renderização no servidor num <script id="ng-state" type="application/json">
// (TransferState) — cada entrada guarda a URL real chamada ("u") e o corpo
// da resposta ("b"). Necessário porque muitas SPAs modernas carregam o
// módulo de busca via lazy-loading (chunk só requisitado pelo router em
// tempo de execução, nunca referenciado como <script src> no HTML inicial)
// — invisível pro scan acima, por mais scripts que ele rastreie. Descoberto
// investigando lopes.com.br: o card de imóvel só tinha 23 de 523 imóveis no
// HTML estático, e o bundle principal (main-*.js) não continha nenhuma
// pista de endpoint — a lógica de busca vivia num chunk nunca referenciado
// na página inicial. Esse blob expõe a URL real sem precisar executar
// JavaScript nenhum.
function findTransferStateUrls(listingHtml: string): string[] {
  const $ = cheerio.load(listingHtml);
  const raw = $("script#ng-state").first().html();
  if (!raw) return [];

  let state: unknown;
  try {
    state = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof state !== "object" || state === null) return [];

  const urls = new Set<string>();
  for (const entry of Object.values(state as Record<string, unknown>)) {
    if (typeof entry !== "object" || entry === null) continue;
    const { u, b, s } = entry as TransferStateCacheEntry;
    if (typeof u !== "string" || b === undefined || b === null) continue;
    if (typeof s === "number" && (s < 200 || s >= 300)) continue;
    urls.add(u);
  }
  return [...urls];
}

// Recursivo (até 2 níveis) — necessário pra achar respostas que envelopam a
// lista de itens dentro de um objeto (ex: Lopes: { products: { content:
// [...], totalElements: 523 } }), não só no nível raiz. Coleta TODOS os
// arrays plausíveis (não só o primeiro achado) e devolve o MAIOR — uma
// resposta de busca real costuma ter várias listas pequenas ao lado da
// listagem de verdade (ex: widgets de SEO com "bairros relacionados", só 4
// itens) que também batem no critério solto de ">=3 objetos"; sem
// desempatar por tamanho, um candidato raso e pequeno (encontrado primeiro
// na ordem de iteração das chaves) vencia um mais profundo e correto
// (achado investigando lopes.com.br: "widgets" tinha 4 itens de link, o
// array real de imóveis estava em "products.content" com 23). Retorna o
// field já com notação de ponto (ex: "products.content"), mesma convenção
// que items_field/total_field usam em getField() (json-api-extractor.ts).
function findItemsArray(body: unknown): { field: string; items: Record<string, unknown>[] } | null {
  const candidates: { field: string; items: Record<string, unknown>[] }[] = [];

  function collect(value: unknown, prefix: string, depth: number): void {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return;

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const field = prefix ? `${prefix}.${key}` : key;
      if (Array.isArray(child) && child.length >= 3 && child.every((v) => typeof v === "object" && v !== null && !Array.isArray(v))) {
        candidates.push({ field, items: child as Record<string, unknown>[] });
      } else if (depth < 2 && typeof child === "object" && child !== null && !Array.isArray(child)) {
        collect(child, field, depth + 1);
      }
    }
  }

  collect(body, "", 0);
  if (candidates.length === 0) return null;

  return candidates.reduce((best, current) => (current.items.length > best.items.length ? current : best));
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    const text = await res.text();
    if (!contentType.includes("json")) {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    }
    return JSON.parse(text);
  } catch {
    return null;
  }
}

interface ProbeResult {
  baseUrl: URL;
  itemsField: string;
  sampleItems: Record<string, unknown>[];
  topLevelFields: Record<string, unknown>;
  confirmedPageParam: string | null;
  // Valor do parâmetro de paginação que reproduz a MESMA resposta "default"
  // (sem o parâmetro) — 0 quando a API é 0-indexed (ex: Lopes: page=0 é a
  // primeira página), 1 quando é 1-indexed (convenção mais comum). Só
  // determinado quando confirmedPageParam existe; 1 é o fallback quando
  // nenhum dos dois bate (preserva o comportamento de antes desta
  // descoberta, que sempre assumia 1-indexed sem checar). Sem isso, uma API
  // 0-indexed perderia a primeira página inteira (ela pularia direto pra
  // page=1, que já é a SEGUNDA página de verdade).
  startingPage: number;
}

// Campos como "total"/"pagesize" podem ficar no nível raiz OU dentro do
// mesmo objeto aninhado que envelopa o array de itens (ex: Lopes:
// products.totalElements, irmão de products.content) — recursivo (mesmo
// limite de profundidade de findItemsArray) pra essa estrutura continuar
// visível pra IA, substituindo só os ARRAYS (em qualquer nível) por um
// placeholder curto, evitando mandar a lista de itens de novo (já vai
// separada em sampleItems).
function summarizeTopLevel(body: Record<string, unknown>, depth = 0): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(body).map(([key, value]) => {
      if (Array.isArray(value)) return [key, `[array de ${value.length} itens]`];
      if (depth < 2 && typeof value === "object" && value !== null) {
        return [key, summarizeTopLevel(value as Record<string, unknown>, depth + 1)];
      }
      return [key, value];
    })
  );
}

async function probeCandidate(pathOrUrl: string, listingUrl: string): Promise<ProbeResult | null> {
  let base: URL;
  try {
    base = new URL(pathOrUrl, listingUrl);
  } catch {
    return null;
  }

  // robots.txt bloqueando este candidato específico é tratado igual a
  // qualquer outro candidato que não bate (retorna null, o chamador tenta
  // o próximo) — não interrompe a detecção inteira, só descarta essa
  // possibilidade sem nunca chegar a fazer uma requisição de dado real
  // pra ela.
  if (!(await isAllowedByRobots(base.toString()))) return null;

  const listing = new URL(listingUrl);
  const attempts: URL[] = [new URL(base)];

  const withListingQuery = new URL(base);
  listing.searchParams.forEach((value, key) => withListingQuery.searchParams.set(key, value));
  if (withListingQuery.toString() !== base.toString()) attempts.push(withListingQuery);

  for (const guess of buildQueryGuesses(listingUrl)) {
    const withGuess = new URL(base);
    guess.forEach((value, key) => withGuess.searchParams.set(key, value));
    attempts.push(withGuess);
  }

  attempts.push(new URL(`${base.toString()}${base.search ? "&" : "?"}page=1`));

  for (const attempt of attempts.slice(0, 20)) {
    const body = await fetchJson(attempt.toString());
    const found = findItemsArray(body);
    if (!found) continue;

    // Confirma paginação de verdade: tenta cada nome de parâmetro comum e
    // compara o primeiro item com o da página 1 — só aceita se a resposta
    // realmente mudar (evita concluir que ?pagina=2 "funciona" quando o
    // servidor só ignora o parâmetro e devolve a página 1 de novo).
    let confirmedPageParam: string | null = null;
    for (const paramName of PAGE_PARAM_CANDIDATES) {
      const page2 = new URL(attempt);
      page2.searchParams.set(paramName, "2");
      const body2 = await fetchJson(page2.toString());
      const found2 = findItemsArray(body2);
      if (found2 && found2.items.length > 0 && JSON.stringify(found2.items[0]) !== JSON.stringify(found.items[0])) {
        confirmedPageParam = paramName;
        break;
      }
    }

    // Descobre se o índice de página começa em 0 ou 1 comparando contra a
    // resposta "default" (sem o parâmetro) — nunca assumido. Ver comentário
    // em ProbeResult.startingPage.
    let startingPage = 1;
    if (confirmedPageParam) {
      for (const candidateStart of [0, 1]) {
        const probeUrl = new URL(attempt);
        probeUrl.searchParams.set(confirmedPageParam, String(candidateStart));
        const bodyN = await fetchJson(probeUrl.toString());
        const foundN = findItemsArray(bodyN);
        if (foundN && foundN.items.length > 0 && JSON.stringify(foundN.items[0]) === JSON.stringify(found.items[0])) {
          startingPage = candidateStart;
          break;
        }
      }
    }

    return {
      baseUrl: attempt,
      itemsField: found.field,
      sampleItems: found.items.slice(0, 3),
      topLevelFields: summarizeTopLevel(body as Record<string, unknown>),
      confirmedPageParam,
      startingPage,
    };
  }

  return null;
}

const FieldMapping = JsonApiSiteConfig.omit({
  strategy: true,
  http_method: true,
  endpoint_url: true,
  request_body_template: true,
  starting_page: true,
  page_increment: true,
  items_field: true,
});

async function mapJsonFields(params: {
  sampleItems: Record<string, unknown>[];
  itemsField: string;
  topLevelFields: Record<string, unknown>;
  knownRealProperties: ExtractedProperty[];
  totalListingsHint: number | null;
}): Promise<import("zod").infer<typeof FieldMapping>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada");

  const client = new Anthropic({ apiKey });

  const knownUrlsHint =
    params.knownRealProperties.length > 0
      ? `\n\nPara ajudar a descobrir como montar a URL da página do imóvel, aqui estão imóveis reais já extraídos do HTML desta mesma listagem (mesma ordem em que devem aparecer nos itens do JSON, assumindo que é a mesma fonte de dados renderizada de duas formas):\n${JSON.stringify(
          params.knownRealProperties.slice(0, 3),
          null,
          2
        )}`
      : "";

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: `Você recebe uma amostra de itens de um endpoint JSON de busca de imóveis e deve mapear os campos para: identificador técnico estável (external_id_field — uso interno, pode ser ilegível, ex: um ID numérico), código/referência VISÍVEL que a imobiliária reconhece (reference_code_field — pode ser o mesmo campo de external_id_field quando ele já for legível, ex: um campo "codigo"/"referencia" textual; null se não existir um código legível separado), preço, indicador de preço indisponível (se existir), e como montar a URL da página individual do imóvel a partir dos campos do item.${
      params.totalListingsHint
        ? ` O site menciona ter aproximadamente ${params.totalListingsHint} imóveis no total — se algum campo do item ou de nível superior bater com esse número, é provavelmente o campo de total.`
        : ""
    } Se não conseguir mapear um campo com confiança, reflita isso em confidence_score baixo e liste a ressalva em warnings.`,
    output_config: { format: zodOutputFormat(FieldMapping), effort: "medium" },
    messages: [
      {
        role: "user",
        content: `Campo do JSON que contém a lista de itens: "${params.itemsField}"\n\nCampos de nível superior da resposta (irmãos do array de itens — é aqui que costuma estar o total, se existir):\n${JSON.stringify(params.topLevelFields, null, 2)}\n\nAmostra de itens (JSON):\n${JSON.stringify(params.sampleItems, null, 2)}${knownUrlsHint}`,
      },
    ],
  });

  if (!response.parsed_output) {
    throw new Error("A IA não retornou um mapeamento de campos válido para este JSON");
  }

  return response.parsed_output;
}

export interface DetectJsonApiResult {
  config: JsonApiSiteConfig;
  candidatesTried: number;
}

// Reproduz automaticamente o processo manual de investigação: varre os
// <script src> da página em busca de pistas de endpoint, testa os
// candidatos, confirma empiricamente (não por suposição) se algum parâmetro
// realmente pagina, e usa a IA só pra mapear os nomes dos campos do JSON —
// não para "adivinhar" a existência do endpoint.
export async function detectJsonApi(params: {
  listingHtml: string;
  listingUrl: string;
  knownRealProperties: ExtractedProperty[];
  totalListingsHint: number | null;
}): Promise<DetectJsonApiResult | null> {
  const scriptUrls = await findCandidateScriptUrls(params.listingHtml, params.listingUrl);
  const scriptCandidatePaths = scriptUrls.length > 0 ? await findCandidateEndpointPaths(scriptUrls) : [];

  // TransferState primeiro — já são URLs REAIS confirmadas por uma chamada
  // de verdade feita durante a renderização no servidor, não uma suposição
  // de regex sobre um bundle minificado (o outro caminho, acima), então tem
  // mais chance de bater de primeira. Set: evita provar a mesma URL duas
  // vezes se ela aparecer nas duas fontes.
  const transferStatePaths = findTransferStateUrls(params.listingHtml);
  const candidatePaths = [...new Set([...transferStatePaths, ...scriptCandidatePaths])];
  if (candidatePaths.length === 0) return null;

  for (const path of candidatePaths) {
    const probe = await probeCandidate(path, params.listingUrl);
    if (!probe) continue;

    const mapping = await mapJsonFields({
      sampleItems: probe.sampleItems,
      itemsField: probe.itemsField,
      topLevelFields: probe.topLevelFields,
      knownRealProperties: params.knownRealProperties,
      totalListingsHint: params.totalListingsHint,
    });

    const endpointTemplate = probe.confirmedPageParam
      ? (() => {
          const templateUrl = new URL(probe.baseUrl);
          templateUrl.searchParams.set(probe.confirmedPageParam!, "{page}");
          return decodeURIComponent(templateUrl.toString());
        })()
      : probe.baseUrl.toString();

    const config: JsonApiSiteConfig = {
      strategy: "json_api",
      http_method: "GET",
      request_body_template: null,
      endpoint_url: endpointTemplate,
      starting_page: probe.startingPage,
      page_increment: 1,
      items_field: probe.itemsField,
      ...mapping,
      confidence_score: probe.confirmedPageParam ? mapping.confidence_score : Math.min(mapping.confidence_score, 0.4),
      warnings: probe.confirmedPageParam
        ? mapping.warnings
        : [
            ...mapping.warnings,
            "Não foi possível confirmar empiricamente um parâmetro de paginação que realmente muda os resultados — este endpoint pode expor só uma página fixa de itens.",
          ],
    };

    return { config, candidatesTried: candidatePaths.length };
  }

  return null;
}
