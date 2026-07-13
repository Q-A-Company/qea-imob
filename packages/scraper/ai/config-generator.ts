import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { cleanListingHtml } from "../core/html-cleaner.js";
import { HtmlCssSiteConfig } from "./site-config-schema.js";

// Extração estruturada com schema forçado (output_config.format) — não exige
// o modelo mais caro. Sonnet 5 entrega qualidade equivalente a Opus em
// tarefas de mapeamento de estrutura/HTML por uma fração do custo, e essa
// chamada roda a cada cadastro de concorrente + até 2x/dia em recalibração
// (self-healing), então o custo por chamada importa.
const MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `Você é um sistema de extração estrutural de HTML. Você recebe o HTML (já limpo de scripts/estilos) de uma página de listagem de imóveis de uma imobiliária e deve identificar os seletores CSS que permitem extrair, de forma determinística (via Cheerio), os dados de cada imóvel anunciado.

A página contém múltiplos "cards" repetidos, cada um representando um imóvel. Identifique:
1. O seletor CSS do container de cada card.
2. Dentro do card, DOIS campos relacionados mas com propósitos diferentes — não confunda um com o outro:
   - external_id: identificador TÉCNICO e ESTÁVEL, usado só internamente pra reconhecer o mesmo imóvel entre checagens ao longo do tempo — NUNCA é mostrado pro usuário final. Priorize sempre um atributo estruturado (href, data-*, ID interno) sobre texto livre, mesmo que o valor seja ilegível pra um humano (ex: um post ID numérico do WordPress) — legibilidade não importa aqui, estabilidade sim. NUNCA use texto do título, descrição, ou qualquer campo que possa conter preço ou formatação variável entre execuções — se esse valor mudar por qualquer motivo que não seja o imóvel ter sido removido, o histórico de preço quebra.
   - reference_code: o código/referência VISÍVEL que a imobiliária reconhece (ex: "CI0298", "mu9536") — este é o campo mostrado nas telas pro usuário final. Procure um texto curto no card que pareça um código de referência (diferente do external_id técnico acima). Se não existir nenhum código reconhecível em lugar nenhum do card, deixe null — não invente um substituto nem reuse o external_id ilegível aqui.
3. Dentro do card, como extrair o preço — incluindo os textos que indicam "preço sob consulta" (indisponível), se existirem.
4. Dentro do card, o link para a página individual do imóvel.
5. Dentro do card, atributos estruturados visíveis (bairro/localização, número de quartos, área) — melhor esforço, cada um independente, null se aquele atributo específico não aparecer no card. Isso é só contexto de exibição (ex: pra reconhecer um imóvel que foi removido do site depois e não tem código de referência) — não precisa ser exaustivo nem cobrir todo atributo que o card mostrar, só os três.
6. O padrão de paginação da listagem, se houver.

Se não conseguir identificar um campo com confiança, reflita isso em confidence_score baixo e liste a ressalva em warnings — isso vale principalmente pros campos obrigatórios (external_id, price, property_url); pros atributos opcionais, é normal e esperado retornar null quando o site não expõe aquele dado, sem que isso baixe a confiança.

Preste atenção especial a sinais de que a paginação é controlada por JavaScript/AJAX e não por navegação de URL simples: um botão (não um link <a href>) para "próxima página", um container com atributo como data-ajax-result, ou uma lista de páginas vazia no HTML estático. Quando notar esses sinais, defina pagination.type como 'next_link' (ou 'none' se nem isso houver) e adicione um warning explícito dizendo que a paginação pode não funcionar sem executar JavaScript.

Sempre procure no texto da página (títulos, contadores de resultado, etc.) alguma menção de quantos imóveis existem no total e preencha total_listings_hint — isso é usado depois para detectar automaticamente quando a página mostra só uma fração do catálogo e vale a pena investigar um endpoint JSON por trás da paginação.

Se não houver essa menção explícita mas a paginação numerada mostrar o número da ÚLTIMA página (ex: um link ou texto indicando "página 135" ou similar), NÃO deixe total_listings_hint como null só por faltar o texto explícito — estime multiplicando o número da última página pela quantidade de cards visíveis nesta página, e diga em warnings que é uma estimativa derivada da paginação (não uma contagem exata do site). Isso importa: sem um total_listings_hint preenchido (nem que seja estimado), o sistema não consegue detectar que a prévia está vendo só uma fração pequena do catálogo, mesmo quando a evidência de que há muito mais páginas está bem ali na paginação.`;

export interface GenerateSiteConfigResult {
  selectors: HtmlCssSiteConfig;
  cleanedHtmlLength: number;
  originalHtmlLength: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export async function generateSiteConfig(params: {
  html: string;
  listingUrl: string;
}): Promise<GenerateSiteConfigResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY não configurada");
  }

  const cleaned = cleanListingHtml(params.html);
  const client = new Anthropic({ apiKey });

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    output_config: {
      format: zodOutputFormat(HtmlCssSiteConfig),
      effort: "high",
    },
    messages: [
      {
        role: "user",
        content: `URL da listagem: ${params.listingUrl}\n\nHTML da página (scripts, estilos e comentários já removidos):\n\n${cleaned.html}`,
      },
    ],
  });

  if (!response.parsed_output) {
    throw new Error("A IA não retornou um site_config válido para este HTML");
  }

  return {
    selectors: response.parsed_output,
    cleanedHtmlLength: cleaned.cleanedLength,
    originalHtmlLength: cleaned.originalLength,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}
