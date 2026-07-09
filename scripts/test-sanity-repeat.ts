import { learnSiteConfig } from "../packages/scraper/jobs/learn-site-config.js";

const url = "https://cutrimimobiliaria.com.br/?s=&bairro=&tipo_de_imovel=&condominio=";
const RUNS = 3;

for (let i = 1; i <= RUNS; i++) {
  const result = await learnSiteConfig(url);
  const sel = result.selectors;
  const externalIdAttr = sel.strategy === "html_css" ? sel.external_id.attribute : sel.external_id_field;
  const externalIdSelector = sel.strategy === "html_css" ? sel.external_id.selector : "(json_api)";
  console.log(
    `Run ${i}: strategy=${sel.strategy} external_id.attribute=${externalIdAttr} selector=${externalIdSelector} confidence=${sel.confidence_score} sanityOk=${result.externalIdSanityOk}`
  );
  if (!result.externalIdSanityOk) {
    console.log("  Warnings de validação automática:", sel.warnings.filter((w) => w.startsWith("[VALIDAÇÃO")));
  }
}
