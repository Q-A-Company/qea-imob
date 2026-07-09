import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { CheckNowButton } from "./check-now-button";
import { RegisterCompetitorForm } from "./register-form";
import { StatusToggle } from "./status-toggle";
import { IntervalSelect } from "./interval-select";

const STATUS_LABEL: Record<string, string> = {
  ativo: "Ativo",
  pausado: "Pausado",
  erro: "Erro",
};

const STATUS_CLASS: Record<string, string> = {
  ativo: "text-green-600 dark:text-green-400",
  pausado: "text-amber-600 dark:text-amber-400",
  erro: "text-red-500 dark:text-red-400",
};

function formatDateTime(value: string | null) {
  if (!value) return "Nunca checado";
  return new Date(value).toLocaleString("pt-BR");
}

// Cadastro mínimo (nome/abreviação/URL/intervalo) — sem aprendizado via IA
// nem preview, ver register-form.tsx. Onboarding completo continua um
// próximo passo natural.
export default async function CompetitorsPage() {
  const profile = await requireRole("admin");
  const supabase = await createClient();

  const { data: competitors, error } = await supabase
    .from("competitors")
    .select("id, name, abbreviation, listing_url, status, last_checked_at, polling_interval_minutes")
    .eq("account_id", profile.account_id ?? "")
    .order("name");

  if (error) {
    throw new Error(`Falha ao carregar concorrentes: ${error.message}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Concorrentes</h1>
        <p className="mt-1 text-sm text-muted">Cadastre e acompanhe os concorrentes monitorados pela sua conta.</p>
      </div>

      <RegisterCompetitorForm />

      {(!competitors || competitors.length === 0) && (
        <p className="text-sm text-muted">Nenhum concorrente cadastrado para esta conta ainda.</p>
      )}

      {competitors && competitors.length > 0 && (
        <ul className="divide-y divide-surface-border rounded-md border border-surface-border bg-surface">
          {competitors.map((competitor) => (
            <li key={competitor.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  <span className="mr-1.5 font-mono text-xs font-semibold text-signal-text">{competitor.abbreviation}</span>
                  {competitor.name}
                </p>
                <p className="truncate text-xs text-muted">{competitor.listing_url}</p>
                <p className="mt-0.5 text-xs text-muted">
                  <span className={STATUS_CLASS[competitor.status] ?? ""}>
                    {STATUS_LABEL[competitor.status] ?? competitor.status}
                  </span>
                  {" · "}
                  Último check: {formatDateTime(competitor.last_checked_at)}
                </p>
              </div>
              <div className="flex shrink-0 items-start gap-2">
                <IntervalSelect competitorId={competitor.id} minutes={competitor.polling_interval_minutes} />
                <StatusToggle competitorId={competitor.id} status={competitor.status} />
                <CheckNowButton competitorId={competitor.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
