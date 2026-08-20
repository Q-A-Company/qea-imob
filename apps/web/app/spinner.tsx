// Compartilhado pelos loading.tsx (convenção do Next.js App Router — cada
// um vira automaticamente o fallback de um <Suspense> em volta do
// page.tsx/layout aninhado daquele segmento de rota, sem precisar montar
// isso manualmente). Só um spinner + texto, propositalmente genérico: cobre
// qualquer tela do app, não é uma skeleton específica de cada página.
export function Spinner({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 py-16" role="status" aria-live="polite">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-surface-border border-t-signal" aria-hidden="true" />
      <span className="text-sm text-muted">{label}</span>
    </div>
  );
}
