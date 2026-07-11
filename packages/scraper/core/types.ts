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
}
