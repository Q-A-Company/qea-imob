import { redirect } from "next/navigation";
import { getProfile, roleHome } from "@/lib/auth/dal";
import { isTermsUpToDate } from "@/lib/legal/terms-gate";
import { AcceptTermsForm } from "./accept-terms-form";

// Fora de requireRole()/(dashboard)/layout.tsx de propósito — é ESTA
// página que resolve o gate de aceite; ela não pode exigir o próprio gate
// pra ser acessada (loop de redirect). Só getProfile() direto, mesmo
// padrão de /login.
export default async function AcceptTermsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  // Já aceitou a versão atual (ex: voltou a esta URL por engano, ou usou o
  // botão "voltar" do navegador depois de aceitar) — não faz sentido
  // mostrar o gate de novo.
  if (await isTermsUpToDate(profile.id)) redirect(roleHome(profile.role));

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-surface-border bg-surface p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-foreground">Antes de continuar</h1>
        <p className="mb-6 text-sm text-muted">
          Pra acessar o Q&amp;A Imob, você precisa ler e aceitar os documentos abaixo.
        </p>
        <AcceptTermsForm />
      </div>
    </main>
  );
}
