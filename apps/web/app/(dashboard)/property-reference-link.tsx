import Link from "next/link";
import { extractLabelFromUrl } from "scraper/core/text-utils";

export interface PropertyAttributes {
  bairro: string | null;
  quartos: string | null;
  area: string | null;
}

// Um imóvel possivelmente vendido já saiu do site do concorrente — a URL
// original quase certamente dá 404/erro. Em vez de linkar pra lá, todo
// consumidor fora de Relatórios encaminha pra cá: Relatórios já filtrado
// por "Possiv. vendido", com from/to vazios (sem limite de data, pro
// imóvel aparecer mesmo removido há mais de 30 dias) — só lá aparece a
// combinação de atributos/rótulo (showDetails=true).
const REMOVED_PROPERTIES_HREF = "/admin/relatorios?status=possivelmente_vendido&from=&to=";

// Código do imóvel como link clicável — usado nas telas onde o
// código/referência aparece em cima de uma mudança (Histórico, Painel/feed,
// Relatórios). Estilo deliberadamente neutro (sem --color-sinal ou outra
// cor de acento): esse token é exclusivo de "mudança detectada", reusá-lo
// aqui confundiria "isto é uma mudança" com "isto é um link". Sublinhado
// SEMPRE visível (não só no hover) — precisa ser identificável como link à
// primeira vista, diferente dos links de paginação (‹ Anterior/Próxima ›),
// onde o contexto já deixa claro que é clicável.
//
// Fallback quando reference_code é null (site sem código legível pra este
// imóvel): rótulo genérico "Ver imóvel" — em vez de esconder a ausência de
// código, ele vira a própria ação (clicar e ver qual é).
//
// Modo rico (showDetails=true, usado exclusivamente por Relatórios — é a
// única tela pensada pra listar TODOS os imóveis removidos de uma vez):
// combina atributos estruturados (bairro/quartos/área) e um rótulo
// derivado do slug da URL (extractLabelFromUrl, funciona retroativamente
// mesmo pra imóveis já removidos, já que só olha a URL já salva). Dispara
// quando não há reference_code OU quando o imóvel está possivelmente
// vendido — mesmo tendo código, a informação completa (código +
// atributos) ajuda a reconhecer o imóvel removido, igual acontece hoje
// pros concorrentes sem código. Fora de Relatórios (showDetails=false),
// o comportamento é sempre texto simples (código ou "Ver imóvel").
//
// url null tem um significado diferente: não é "site sem código", é
// "property nem existe mais no banco" (só acontece em get-run-changes.ts,
// Histórico/Erros — os outros dois consumidores simplesmente omitem a
// linha quando a property não é encontrada; aqui ela precisa aparecer
// mesmo assim, referenciando um scraper_run antigo). properties.url é
// not null pra qualquer property real (constraint desde a criação da
// tabela, todo caminho de extração descarta o card sem ela antes de
// persistir) — url null só pode significar isso, nunca "site sem url".
// Por isso o rótulo muda pra "Imóvel removido" (sem link, não tem pra onde
// ir) em vez do "Ver imóvel" clicável do outro caso.
export function PropertyReferenceLink({
  referenceCode,
  url,
  status = "ativo",
  attributes = null,
  showDetails = false,
  className = "",
}: {
  referenceCode: string | null;
  url: string | null;
  status?: "ativo" | "possivelmente_vendido";
  attributes?: PropertyAttributes | null;
  showDetails?: boolean;
  className?: string;
}) {
  if (!url) {
    return <span className={className}>{referenceCode ?? "Imóvel removido"}</span>;
  }

  const linkClassName = `underline decoration-1 underline-offset-2 hover:opacity-70 ${className}`;

  // Modo rico: em Relatórios (showDetails=true), quando falta código OU o
  // imóvel está possivelmente vendido — nesse segundo caso mesmo com
  // código, já que "informações completas" pra um imóvel removido inclui
  // os atributos/rótulo, não só o código isolado. Continua linkando pra
  // URL original mesmo removido: já estamos em Relatórios, reencaminhar
  // pra cá de novo não faria sentido.
  if (showDetails && (!referenceCode || status === "possivelmente_vendido")) {
    const primaryText = referenceCode ?? extractLabelFromUrl(url) ?? "Ver imóvel";
    const attributeParts = [attributes?.bairro, attributes?.quartos, attributes?.area].filter(
      (part): part is string => Boolean(part)
    );

    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={linkClassName}>
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{primaryText}</span>
          {attributeParts.length > 0 ? (
            <span className="truncate text-[10px] font-normal text-muted no-underline">{attributeParts.join(" · ")}</span>
          ) : null}
        </span>
      </a>
    );
  }

  // Fora do modo rico: sempre texto simples (código ou "Ver imóvel").
  // Possivelmente vendido (com ou sem código) encaminha pra Relatórios em
  // vez de linkar pra URL original morta — decisão confirmada com o
  // usuário mesmo pro caso COM código, já que a URL original está igualmente
  // morta nos dois casos.
  if (status === "possivelmente_vendido") {
    return (
      <Link href={REMOVED_PROPERTIES_HREF} className={linkClassName}>
        {referenceCode ?? "Ver imóvel"}
      </Link>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={linkClassName}>
      {referenceCode ?? "Ver imóvel"}
    </a>
  );
}
