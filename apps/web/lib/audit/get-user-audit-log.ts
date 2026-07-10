import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

export interface AuditLogRow {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  actionType: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

const RECENT_LIMIT = 25;

// "Histórico" do usuário mostra tanto o que ELE fez (actor) quanto o que
// fizeram COM ele (target) — ex: "fulano foi bloqueado por sicrano" precisa
// aparecer no histórico do fulano mesmo ele não sendo o actor. Daí o
// .or() em vez de um filtro só por actor_user_id.
//
// Mesmo raciocínio de client/filtro manual de get-user-login-audit.ts:
// service role + account_id explícito, porque a policy de leitura desta
// tabela não cobre SuperAdmin de propósito.
//
// accountId nulo = SuperAdmin no próprio perfil (/profile) — mesmo motivo
// de getUserLoginAudit: current_account_id() do SuperAdmin é sempre NULL,
// e "NULL = NULL" não é verdadeiro em SQL, então .eq() nunca acharia as
// próprias linhas dele; .is("account_id", null) é o operador certo aqui.
export async function getUserAuditLog(accountId: string | null, userId: string): Promise<{ rows: AuditLogRow[]; totalCount: number }> {
  const serviceClient = createServiceClient();

  let query = serviceClient
    .from("audit_log")
    .select("id, actor_user_id, action_type, target_type, target_id, details, created_at", { count: "exact" })
    .or(`actor_user_id.eq.${userId},and(target_type.eq.user,target_id.eq.${userId})`);
  query = accountId === null ? query.is("account_id", null) : query.eq("account_id", accountId);

  const { data, error, count } = await query.order("created_at", { ascending: false }).range(0, RECENT_LIMIT - 1);
  if (error) throw new Error(`Falha ao buscar histórico de auditoria: ${error.message}`);

  const rows = data ?? [];
  const actorIds = [...new Set(rows.map((r) => r.actor_user_id).filter((id): id is string => id !== null))];

  // Nome do ator resolvido à parte — o Database type deste projeto não tem
  // metadados de relacionamento (ver comentário em lib/supabase/types.ts),
  // então um embed tipado do PostgREST não é confiável aqui; busca separada
  // + Map é o mesmo padrão já usado em get-dashboard-data.ts/get-report-data.ts.
  const actorNames = new Map<string, string | null>();
  if (actorIds.length > 0) {
    const { data: actorProfiles } = await serviceClient.from("profiles").select("id, full_name").in("id", actorIds);
    for (const p of actorProfiles ?? []) actorNames.set(p.id, p.full_name);
  }

  return {
    rows: rows.map((row) => ({
      id: row.id,
      actorUserId: row.actor_user_id,
      actorName: row.actor_user_id ? (actorNames.get(row.actor_user_id) ?? null) : null,
      actionType: row.action_type,
      targetType: row.target_type,
      targetId: row.target_id,
      details: row.details,
      createdAt: row.created_at,
    })),
    totalCount: count ?? rows.length,
  };
}
