export interface ExtractedProperty {
  external_id: string;
  // Código/referência VISÍVEL (o que a imobiliária reconhece) — null quando
  // o site não expõe nenhum código legível pra este imóvel específico
  // (pode variar por imóvel dentro do MESMO concorrente, não só por site).
  // Nunca usado pra comparação/identidade — só exibição (ver external_id).
  reference_code: string | null;
  price: number | null;
  price_status: "valor" | "sob_consulta";
  url: string;
  // Camada 3 de identificação de imóvel removido sem reference_code —
  // melhor esforço, null quando o site não expõe o dado (não é um erro, é
  // esperado pra boa parte dos sites). Nunca usado em identidade/
  // comparação, só exibição — mesmo status de reference_code. (Camada 2,
  // foto, foi removida — decisão do usuário de não guardar mais imagem.)
  attributes: { bairro: string | null; quartos: string | null; area: string | null } | null;
}
