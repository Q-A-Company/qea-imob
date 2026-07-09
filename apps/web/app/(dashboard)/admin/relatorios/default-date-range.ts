// Compartilhado entre parse-filters.ts (servidor) e report-filters.tsx
// (cliente, botão "Limpar filtros") — os dois precisam concordar sobre
// qual é exatamente o período "padrão" (últimos 30 dias).
export function defaultDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}
