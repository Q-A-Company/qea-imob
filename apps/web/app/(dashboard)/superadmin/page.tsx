import { requireRole } from "@/lib/auth/dal";

export default async function SuperAdminPage() {
  const profile = await requireRole("superadmin");

  return (
    <div>
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
        Painel SuperAdmin
      </h1>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Olá, {profile.full_name ?? profile.id}. Contas, saúde dos scrapers e recalibrações
        entram na Etapa 12.
      </p>
    </div>
  );
}
