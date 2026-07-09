import Link from "next/link";

// canManage=false (role Usuario, Etapa 11): sem link pra /admin/competitors
// — Usuario não tem acesso àquela tela, e mesmo que tivesse, não pode
// cadastrar nada. Mostra só uma mensagem, sem ação.
export function EmptyState({ canManage }: { canManage: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-surface-border px-6 py-16 text-center">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-10 w-10 text-signal-text">
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </svg>
      <div>
        <p className="text-sm font-semibold text-foreground">Nenhum concorrente monitorado ainda</p>
        <p className="mt-1 max-w-sm text-sm text-muted">
          {canManage
            ? "Cadastre seu primeiro concorrente para começar a receber alertas de mudança de preço quase em tempo real."
            : "Peça a um Admin da sua conta para cadastrar o primeiro concorrente."}
        </p>
      </div>
      {canManage && (
        <Link
          href="/admin/competitors"
          className="rounded-md bg-signal px-4 py-2 text-sm font-semibold text-signal-on hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        >
          Cadastrar primeiro concorrente
        </Link>
      )}
    </div>
  );
}
