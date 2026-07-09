// Paleta categórica — só para distinguir concorrentes em gráficos (ex:
// fatias do gráfico de pizza), nunca para decoração geral da UI. Deliberadamente
// longe do hue do Signal Amber (--color-signal, #FFB020) para não competir
// com ele: Amber continua exclusivo de "mudança detectada".
export const CATEGORICAL_PALETTE = [
  { name: "Steel", hex: "#6B9BD1" },
  { name: "Teal", hex: "#4FB0A5" },
  { name: "Violet", hex: "#9B87D6" },
  { name: "Rose", hex: "#E08FA0" },
  { name: "Sage", hex: "#8FB88A" },
  { name: "Slate", hex: "#7C8CA8" },
  { name: "Terracotta", hex: "#C97B63" },
  { name: "Periwinkle", hex: "#7B93E0" },
] as const;

// Hash determinístico (djb2) — mesma cor sempre para o mesmo competitor_id,
// entre sessões e recarregamentos, sem precisar guardar a cor no banco.
function djb2Hash(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return Math.abs(hash);
}

export function colorForCompetitor(competitorId: string): string {
  const index = djb2Hash(competitorId) % CATEGORICAL_PALETTE.length;
  return CATEGORICAL_PALETTE[index]!.hex;
}
