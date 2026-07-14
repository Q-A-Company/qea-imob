import { requireRole } from "@/lib/auth/dal";
import { AppearanceThemeToggle } from "../../admin/settings/appearance-theme-toggle";
import { LegalLinksSection } from "../../legal-links-section";

// Configuração PESSOAL do SuperAdmin — distinta de /superadmin/system
// (config global da plataforma). Só Aparência por enquanto: SuperAdmin não
// tem account_id, então os controles de notificação/e-mail das outras telas
// de Configurações (escopados a uma conta) não se aplicam aqui.
export default async function SuperAdminSettingsPage() {
  await requireRole("superadmin");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Configurações</h1>
        <p className="mt-1 text-sm text-muted">Sua preferência pessoal.</p>
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Aparência</h2>
          <p className="mt-1 text-xs text-muted">Preferência pessoal, vale só neste dispositivo.</p>
        </div>
        <AppearanceThemeToggle />
      </section>

      <LegalLinksSection />
    </div>
  );
}
