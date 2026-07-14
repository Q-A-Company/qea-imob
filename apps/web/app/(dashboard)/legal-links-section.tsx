import Link from "next/link";

// Compartilhado pelas 3 telas de Configurações (admin, user, superadmin) —
// acesso permanente aos documentos legais, além do rodapé do login e da
// tela de aceite obrigatório (/aceitar-termos).
export function LegalLinksSection() {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Documentos legais</h2>
        <p className="mt-1 text-xs text-muted">Os mesmos que você aceitou no primeiro acesso.</p>
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <Link href="/termos" target="_blank" rel="noopener noreferrer" className="text-signal-text hover:underline">
          Termos de Uso ↗
        </Link>
        <Link href="/privacidade" target="_blank" rel="noopener noreferrer" className="text-signal-text hover:underline">
          Política de Privacidade ↗
        </Link>
      </div>
    </section>
  );
}
