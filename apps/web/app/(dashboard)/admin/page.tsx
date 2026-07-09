import { requireRole } from "@/lib/auth/dal";

export default async function AdminPage() {
  const profile = await requireRole("admin");

  return (
    <div>
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
        Painel Admin
      </h1>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Olá, {profile.full_name ?? profile.id}. Cadastro de concorrentes, histórico e
        configurações de notificação entram nas próximas etapas.
      </p>
    </div>
  );
}
