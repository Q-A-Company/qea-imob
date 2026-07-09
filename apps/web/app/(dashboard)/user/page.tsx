import { requireRole } from "@/lib/auth/dal";

export default async function UserPage() {
  const profile = await requireRole("usuario");

  return (
    <div>
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
        Histórico de preços
      </h1>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Olá, {profile.full_name ?? profile.id}. A timeline somente leitura entra na Etapa 11.
      </p>
    </div>
  );
}
