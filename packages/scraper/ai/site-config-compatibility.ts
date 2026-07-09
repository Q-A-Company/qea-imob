import type { SiteConfigSelectors } from "./site-config-schema.js";

export interface CompatibilityCheckResult {
  compatible: boolean;
  reasons: string[];
}

// Um seletor CSS é "ancestral" do outro (via combinador de descendência,
// espaço) quando o texto extraído do ancestral inclui, no Cheerio, todo o
// texto dos seus descendentes — inclusive o do outro seletor. É esse
// vazamento que interessa detectar, não o fato de os dois usarem
// attribute: "text" (a maioria dos external_id e price legítimos usa texto
// livre, em seletores irmãos que não se sobrepõem — ver nota de
// falso positivo abaixo).
function isAncestorSelector(maybeAncestor: string, maybeDescendant: string): boolean {
  const a = maybeAncestor.trim().replace(/\s+/g, " ");
  const b = maybeDescendant.trim().replace(/\s+/g, " ");
  return b === a || b.startsWith(`${a} `);
}

// Checagem de sanidade aplicada a QUALQUER site_config recém-gerado, com ou
// sem config anterior pra comparar. Pega o caso concreto encontrado ao
// validar a Etapa 3: a IA mapeou external_id para o mesmo seletor de texto
// do preço (título do card, que muda a cada alteração de valor) em vez de
// um identificador estável — o reforço no prompt reduz a chance disso
// acontecer, mas não garante; isso é a rede de segurança em código.
//
// Falso positivo corrigido (2026-07-10, descoberto ao semear
// mullerimoveis.com.br fora de um teste automatizado): a versão anterior
// rejeitava sempre que external_id E price usavam attribute: "text",
// mesmo com seletores CSS completamente distintos e não sobrepostos (ex:
// ".imovelcard__info__ref strong" vs ".imovelcard__valor__valor" — irmãos
// dentro do card, não um dentro do outro). Isso derrubava confidence_score
// para 0.2 em configs corretas. Substituído por uma checagem estrutural
// (isAncestorSelector): só sinaliza quando um seletor é literalmente
// ancestral do outro no DOM, caso em que o .text() do ancestral
// necessariamente inclui o texto do descendente — o mecanismo real do bug
// original (ver scripts/test-sanity-unit.ts).
export function checkExternalIdSanity(config: SiteConfigSelectors): CompatibilityCheckResult {
  const reasons: string[] = [];

  if (config.strategy === "html_css") {
    const samePriceField =
      config.external_id.selector === config.price.selector && config.external_id.attribute === config.price.attribute;

    if (samePriceField) {
      reasons.push(
        "external_id usa exatamente o mesmo seletor+atributo do preço — provavelmente capturou título/descrição em texto livre em vez de um identificador estável."
      );
    } else if (
      config.external_id.attribute === "text" &&
      config.price.attribute === "text" &&
      (isAncestorSelector(config.external_id.selector, config.price.selector) ||
        isAncestorSelector(config.price.selector, config.external_id.selector))
    ) {
      reasons.push(
        "O seletor de external_id é ancestral (ou descendente) do seletor de price no DOM — a extração de texto do ancestral inclui o texto do descendente, então external_id provavelmente carrega o preço junto, mesmo com seletores nominalmente diferentes."
      );
    }
  }

  if (config.strategy === "json_api" && config.external_id_field === config.price_field) {
    reasons.push("external_id_field é o mesmo campo de price_field no JSON — provavelmente um mapeamento incorreto.");
  }

  return { compatible: reasons.length === 0, reasons };
}

// Compara a estratégia de extração de external_id entre um site_config já
// em uso e um recém-gerado (ex: por recalibração automática — Etapa 7).
// Não decide sozinho se deve substituir a config ativa: só sinaliza quando
// a mudança é estrutural o suficiente para arriscar quebrar a continuidade
// do histórico em property_changes. A Etapa 7 deve chamar esta função antes
// de qualquer troca automática e, se compatible=false, marcar o novo
// site_config com status 'pendente_revisao' em vez de ativá-lo diretamente.
export function checkExternalIdCompatibility(params: {
  previous: SiteConfigSelectors;
  next: SiteConfigSelectors;
}): CompatibilityCheckResult {
  const { previous, next } = params;
  const reasons: string[] = [];

  if (previous.strategy !== next.strategy) {
    reasons.push(`Estratégia de extração mudou de '${previous.strategy}' para '${next.strategy}'.`);
  } else if (previous.strategy === "html_css" && next.strategy === "html_css") {
    if (previous.external_id.attribute !== next.external_id.attribute) {
      reasons.push(
        `Forma de extrair external_id mudou de '${previous.external_id.attribute}' para '${next.external_id.attribute}'.`
      );
    }
  } else if (previous.strategy === "json_api" && next.strategy === "json_api") {
    if (previous.external_id_field !== next.external_id_field) {
      reasons.push(`Campo de external_id mudou de '${previous.external_id_field}' para '${next.external_id_field}'.`);
    }
  }

  const sanity = checkExternalIdSanity(next);
  reasons.push(...sanity.reasons);

  return { compatible: reasons.length === 0, reasons };
}
