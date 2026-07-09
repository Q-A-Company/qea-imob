export interface ExtractedProperty {
  external_id: string;
  price: number | null;
  price_status: "valor" | "sob_consulta";
  url: string;
}
