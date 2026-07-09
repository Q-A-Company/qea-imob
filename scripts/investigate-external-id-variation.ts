import { learnSiteConfig } from "../packages/scraper/jobs/learn-site-config.js";
import { checkExternalIdSanity } from "../packages/scraper/ai/site-config-compatibility.js";
import type { HtmlCssSiteConfig } from "../packages/scraper/ai/site-config-schema.js";

const REAL_URL = "https://www.mullerimoveis.com.br/imovel/venda";
const RUNS = 5;

// Pergunta a responder: quando a IA varia o TIPO de atributo do external_id
// entre chamadas (text/href/data), isso é variação dentro do mesmo padrão de
// segurança (todas as opções são estruturalmente estáveis) ou existe risco
// real de uma opção ruim passar batido pela sanity check?
for (let i = 1; i <= RUNS; i++) {
  const learned = await learnSiteConfig(REAL_URL);
  const selectors = learned.selectors as HtmlCssSiteConfig;
  const sanity = checkExternalIdSanity(selectors);

  console.log(`\n=== Rodada ${i}/${RUNS} ===`);
  console.log("external_id:", JSON.stringify(selectors.external_id));
  console.log("price:", JSON.stringify({ selector: selectors.price.selector, attribute: selectors.price.attribute }));
  console.log("externalIdSanityOk (do learnSiteConfig):", learned.externalIdSanityOk);
  console.log("checkExternalIdSanity direto:", JSON.stringify(sanity));
  console.log("confidence_score:", selectors.confidence_score);

  // Amostra real do valor extraído para esse external_id, pra ver o que
  // realmente está sendo capturado (não só o seletor declarado).
  const sample = learned.preview[0];
  console.log("amostra (primeiro imóvel):", sample ? { external_id: sample.external_id, price: sample.price, url: sample.url } : "nenhuma");
}
