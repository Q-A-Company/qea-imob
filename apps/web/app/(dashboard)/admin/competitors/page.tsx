import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { RegisterCompetitorForm } from "./register-form";
import { CompetitorsList } from "./competitors-list";

// Cadastro mínimo (nome/abreviação/URL/intervalo) — sem aprendizado via IA
// nem preview, ver register-form.tsx. Onboarding completo continua um
// próximo passo natural.
export default async function CompetitorsPage() {
  const profile = await requireRole(["admin", "gerente"]);
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

      <CompetitorsList
        competitors={(competitors ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          abbreviation: c.abbreviation,
          listingUrl: c.listing_url,
          status: c.status,
          lastCheckedAt: c.last_checked_at,
          pollingIntervalMinutes: c.polling_interval_minutes,
        }))}
      />
    </div>
  );
}
