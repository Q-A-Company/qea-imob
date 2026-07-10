import { requireRole } from "@/lib/auth/dal";
import { getOwnProfile } from "@/lib/profile/get-own-profile";
import { getUserLoginAudit } from "@/lib/audit/get-user-login-audit";
import { getUserAuditLog } from "@/lib/audit/get-user-audit-log";
import type { UserRole } from "@/lib/supabase/types";
import { SelfProfileContent } from "./self-profile-content";

// Rota única, compartilhada por TODOS os cargos (decisão confirmada) — ao
// contrário de /admin/* vs /user/*, o conteúdo aqui é sempre "meus próprios
// dados", estruturalmente idêntico pra qualquer cargo (só o DADO muda), então
// não há razão pra espelhar em rotas separadas.
const ANY_ROLE: UserRole[] = ["superadmin", "admin", "gerente", "usuario"];

export default async function ProfilePage() {
  const profile = await requireRole(ANY_ROLE);

  // Não usa getAccountUser (exige account_id bater) — SuperAdmin não tem
  // account_id, getOwnProfile busca só por "id = eu mesmo".
  const user = await getOwnProfile(profile.id);
  if (!user) throw new Error("Perfil não encontrado");

  const [loginAudit, auditLog] = await Promise.all([
    getUserLoginAudit(profile.account_id, profile.id),
    getUserAuditLog(profile.account_id, profile.id),
  ]);

  return <SelfProfileContent user={user} loginAudit={loginAudit} auditLog={auditLog} />;
}
