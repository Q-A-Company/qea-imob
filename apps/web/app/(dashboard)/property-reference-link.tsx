// Código do imóvel como link clicável — usado nas 3 telas onde o
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
  className = "",
}: {
  referenceCode: string | null;
  url: string | null;
  className?: string;
}) {
  if (!url) {
    return <span className={className}>{referenceCode ?? "Imóvel removido"}</span>;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`underline decoration-1 underline-offset-2 hover:opacity-70 ${className}`}
    >
      {referenceCode ?? "Ver imóvel"}
    </a>
  );
}
