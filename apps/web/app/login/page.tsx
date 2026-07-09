import { redirect } from "next/navigation";
import { getProfile, roleHome } from "@/lib/auth/dal";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const profile = await getProfile();
  if (profile) redirect(roleHome(profile.role));

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 dark:bg-neutral-950">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="mb-1 text-xl font-semibold text-neutral-900 dark:text-neutral-50">
          Q&A Imob
        </h1>
        <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
          Entre com sua conta para continuar.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
