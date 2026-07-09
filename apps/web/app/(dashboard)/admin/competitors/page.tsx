import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { CheckNowButton } from "./check-now-button";

const STATUS_LABEL: Record<string, string> = {
  ativo: "Ativo",
  pausado: "Pausado",
  erro: "Erro",
};

const STATUS_CLASS: Record<string, string> = {
  ativo: "text-green-600 dark:text-green-400",
  pausado: "text-amber-600 dark:text-amber-400",
  erro: "text-red-600 dark:text-red-400",
};

function formatDateTime(value: string | null) {
  if (!value) return "Nunca checado";
  return new Date(value).toLocaleString("pt-BR");
}

// Versão mínima desta tela — só o essencial para o botão "Verificar agora"
// funcionar (Etapa 5). Cadastro de concorrente, preview de IA e
// configurações de notificação são escopo da Etapa 10.
export default async function CompetitorsPage() {
  const profile = await requireRole("admin");
  const supabase = await createClient();

  const { data: competitors, error } = await supabase
    .from("competitors")
    .select("id, name, listing_url, status, last_checked_at, polling_interval_minutes")
    .eq("account_id", profile.account_id ?? "")
    .order("name");

  if (error) {
    throw new Error(`Falha ao carregar concorrentes: ${error.message}`);
  }

  return (
    <div>
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Concorrentes</h1>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Lista mínima para validar a checagem manual (Etapa 5). Cadastro e configurações completas
        entram na Etapa 10.
      </p>

      {(!competitors || competitors.length === 0) && (
        <p className="mt-6 text-sm text-neutral-500 dark:text-neutral-400">
          Nenhum concorrente cadastrado para esta conta ainda.
        </p>
      )}

      {competitors && competitors.length > 0 && (
        <ul className="mt-6 divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
          {competitors.map((competitor) => (
            <li key={competitor.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                  {competitor.name}
                </p>
                <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                  {competitor.listing_url}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  <span className={STATUS_CLASS[competitor.status] ?? ""}>
                    {STATUS_LABEL[competitor.status] ?? competitor.status}
                  </span>
                  {" · "}
                  Último check: {formatDateTime(competitor.last_checked_at)}
                  {" · "}a cada {competitor.polling_interval_minutes} min
                </p>
              </div>
              <CheckNowButton competitorId={competitor.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
