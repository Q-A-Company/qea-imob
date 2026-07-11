import { requireRole } from "@/lib/auth/dal";
import { getAccountCompetitors } from "../get-account-competitors";

const STATUS_LABEL: Record<string, string> = { ativo: "Ativo", pausado: "Pausado", erro: "Erro" };
const STATUS_CLASS: Record<string, string> = {
  ativo: "text-sucesso-texto",
  pausado: "text-erro-texto",
  erro: "text-erro-texto",
};

function formatDateTime(value: string | null): string {
  if (!value) return "Nunca checado";
  return new Date(value).toLocaleString("pt-BR");
}

// Somente leitura — sem IntervalSelect/StatusToggle/CheckNowButton, que só
// existem em /admin/competitors (gestão é do Admin da própria conta). O
// SuperAdmin observa pra diagnóstico, não administra por aqui.
export default async function AccountCompetitorsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("superadmin");
  const { id } = await params;
  const competitors = await getAccountCompetitors(id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Concorrentes</h1>
        <p className="mt-1 text-sm text-muted">Somente leitura — gestão (pausar, editar intervalo) é feita pelo Admin da conta.</p>
      </div>

      {competitors.length === 0 && <p className="text-sm text-muted">Nenhum concorrente cadastrado para esta conta ainda.</p>}

      {competitors.length > 0 && (
        <ul className="divide-y divide-surface-border rounded-md border border-surface-border bg-surface">
          {competitors.map((c) => (
            <li key={c.id} className="px-4 py-3">
              <p className="text-sm font-medium text-foreground">
                <span className="mr-1.5 font-mono text-xs font-semibold text-signal-text">{c.abbreviation}</span>
                {c.name}
              </p>
              <p className="truncate text-xs text-muted">{c.listingUrl}</p>
              <p className="mt-0.5 text-xs text-muted">
                <span className={STATUS_CLASS[c.status] ?? ""}>{STATUS_LABEL[c.status] ?? c.status}</span>
                {" · a cada "}
                {c.pollingIntervalMinutes} min{" · último check: "}
                {formatDateTime(c.lastCheckedAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
