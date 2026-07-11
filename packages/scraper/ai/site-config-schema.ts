import { z } from "zod";

// ---------------------------------------------------------------------------
// Estratégia "html_css": seletores CSS via Cheerio sobre o HTML da listagem.
// É a única estratégia que a IA (config-generator) sabe gerar — cobre a
// maioria dos sites. Seletores são relativos ao card (exceto card_selector).
// ---------------------------------------------------------------------------

const FieldSelector = z.object({
  selector: z
    .string()
    .describe("Seletor CSS relativo ao container do card (ex: '.preco', 'span.valor')"),
  attribute: z
    .enum(["text", "href", "data"])
    .describe("Como extrair o valor: texto do elemento, atributo href, ou um atributo data-*"),
  data_attribute: z
    .string()
    .nullable()
    .describe("Nome do atributo quando attribute='data' (ex: 'data-preco'); null caso contrário"),
});

const PriceSelector = FieldSelector.extend({
  sob_consulta_markers: z
    .array(z.string())
    .describe(
      "Textos que aparecem no lugar do preço quando ele está indisponível (ex: ['Sob Consulta', 'Consulte-nos']). Lista vazia se o site sempre mostra preço."
    ),
});

const Pagination = z.object({
  type: z
    .enum(["query_param", "path_segment", "next_link", "none"])
    .describe(
      "Como a paginação funciona: parâmetro de query (?page=2), segmento de path (/pagina/2), link 'próxima página' a seguir, ou sem paginação"
    ),
  param_name: z
    .string()
    .nullable()
    .describe("Nome do parâmetro de query quando type='query_param' (ex: 'page'); null caso contrário"),
  next_link_selector: z
    .string()
    .nullable()
    .describe("Seletor CSS do link/botão 'próxima página' quando type='next_link'; null caso contrário"),
});

export const HtmlCssSiteConfig = z.object({
  strategy: z.literal("html_css"),
  card_selector: z
    .string()
    .describe("Seletor CSS do container de cada card de imóvel, relativo ao documento inteiro"),
  external_id: FieldSelector.describe(
    "Identificador TÉCNICO estável do imóvel, usado só internamente pra reconhecer o mesmo imóvel entre checagens — nunca é mostrado pro usuário. Pode ser ilegível (ex: um ID interno numérico)."
  ),
  reference_code: FieldSelector.nullable().describe(
    "Seletor pro código/referência VISÍVEL do imóvel — o que a imobiliária reconhece (ex: 'CI0298', 'mu9536'), mostrado nas telas pro usuário final. Pode ser diferente de external_id (que prioriza estabilidade técnica, não legibilidade) ou apontar pro mesmo elemento, se ele já for legível. null se o site não mostra nenhum código reconhecível em lugar nenhum do card — não invente um substituto."
  ),
  price: PriceSelector.describe("Preço do imóvel"),
  property_url: FieldSelector.describe("Link para a página individual do imóvel (attribute deve ser 'href')"),
  pagination: Pagination,
  total_listings_hint: z
    .number()
    .int()
    .nullable()
    .describe(
      "Se o texto da página mencionar quantos imóveis/resultados existem no total (ex: '1.409 imóveis', '335 imóveis', '200 resultados'), extraia esse número aqui. Se não houver essa menção explícita, mas a paginação mostrar o número da ÚLTIMA página (ex: 'página 135' ou um link para a última página de uma paginação numerada), ESTIME o total multiplicando esse número pela quantidade de cards visíveis nesta página (ex: última página = 135, 8 cards nesta página → estime ~1080) e registre em warnings que é uma estimativa derivada da paginação, não uma contagem explícita do site. null apenas se nenhuma das duas informações (menção explícita OU número de última página) estiver disponível."
    ),
  confidence_score: z
    .number()
    .min(0)
    .max(1)
    .describe("Confiança de 0 a 1 de que esses seletores extraem corretamente todos os cards da página"),
  warnings: z
    .array(z.string())
    .describe("Ressalvas observadas (ex: 'alguns cards não têm referência visível'); lista vazia se nenhuma"),
});

export type HtmlCssSiteConfig = z.infer<typeof HtmlCssSiteConfig>;

// ---------------------------------------------------------------------------
// Estratégia "json_api": endpoint JSON paginado descoberto por trás de um
// site com paginação client-side (ex: AJAX). Detectada automaticamente por
// packages/scraper/ai/json-api-detector.ts quando a cobertura via html_css
// fica muito abaixo de total_listings_hint — existe para não deixar esses
// sites travados em "só a primeira página", sem precisar do fallback
// Playwright (mais lento/caro).
// ---------------------------------------------------------------------------

export const JsonApiSiteConfig = z.object({
  strategy: z.literal("json_api"),
  http_method: z.enum(["GET", "POST"]).describe("Método HTTP usado em cada requisição de página"),
  endpoint_url: z
    .string()
    .describe(
      "URL do endpoint. Para GET com paginação na query string, use '{page}' como placeholder (ex: '.../search?page={page}'). Para POST (paginação vai no corpo), é uma URL fixa, sem placeholder."
    ),
  request_body_template: z
    .string()
    .nullable()
    .describe(
      "Corpo da requisição como string JSON, usado quando http_method='POST', com '{page}' no lugar do valor de paginação (ex: '{\"start\":{page},\"numRows\":12}'). null quando http_method='GET'."
    ),
  starting_page: z
    .number()
    .int()
    .min(0)
    .describe("Valor inicial do cursor de paginação — número da primeira página (geralmente 1) ou offset inicial (geralmente 0)"),
  page_increment: z
    .number()
    .int()
    .min(1)
    .describe("Quanto somar ao cursor a cada página seguinte — 1 para número de página sequencial; o tamanho da página (ex: 12) para paginação por offset"),
  items_field: z
    .string()
    .describe("Caminho até o array de imóveis na resposta, com '.' para aninhamento (ex: 'items' ou 'response.docs')"),
  total_field: z
    .string()
    .nullable()
    .describe("Caminho até o total de imóveis (mesma notação com '.'), usado para saber quando parar de paginar; null se não existir"),
  external_id_field: z
    .string()
    .describe("Campo do item com o identificador TÉCNICO estável do imóvel — uso interno, nunca mostrado pro usuário, pode ser ilegível."),
  reference_code_field: z
    .string()
    .nullable()
    .describe(
      "Campo do item com o código/referência VISÍVEL do imóvel (mesma notação com '.' de total_field) — o que a imobiliária reconhece, mostrado nas telas. Pode ser o mesmo campo de external_id_field quando ele já for legível (ex: um campo 'codigo'/'referencia' textual, não um ID numérico interno), ou um campo diferente. null se não existir um código legível separado."
    ),
  price_field: z.string().describe("Campo do item com o preço numérico"),
  price_unavailable_field: z
    .string()
    .nullable()
    .describe("Campo booleano do item que indica preço indisponível/oculto (ex: 'ocultarValor'); null se não existir"),
  property_url_field: z.string().describe("Campo do item com o slug/caminho relativo da página do imóvel"),
  property_url_base: z
    .string()
    .describe("Prefixo para montar a URL absoluta do imóvel a partir do valor de property_url_field"),
  property_url_suffix_field: z
    .string()
    .nullable()
    .describe(
      "Campo adicional a ser concatenado após property_url_field (separado por '/') quando o slug sozinho não forma a URL completa — ex: o site usa /imovel/{slug}/{codigo}. null quando property_url_base + property_url_field já formam a URL completa."
    ),
  confidence_score: z.number().min(0).max(1),
  warnings: z.array(z.string()),
});

export type JsonApiSiteConfig = z.infer<typeof JsonApiSiteConfig>;

export const SiteConfigSelectors = z.discriminatedUnion("strategy", [HtmlCssSiteConfig, JsonApiSiteConfig]);

export type SiteConfigSelectors = z.infer<typeof SiteConfigSelectors>;
