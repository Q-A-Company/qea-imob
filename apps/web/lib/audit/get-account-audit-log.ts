import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

export interface AccountAuditLogRow {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  actionType: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export const ACCOUNT_ACTIVITY_PAGE_SIZE = 25;

// "Atividade" da conta (SuperAdmin) — tudo que já é instrumentado em
// audit_log, escopado à conta, MENOS login/logout (isso é ruído de acesso,
// não atividade administrativa/de negócio — pedido explícito). Mesmo
// raciocínio de service role + account_id explícito de get-user-audit-log.ts:
// a policy de leitura desta tabela não cobre SuperAdmin de propósito.
//
// Paginação real via .range() (não .limit() sozinho) — mesma lição já
// aplicada em vários lugares deste projeto depois do bug de truncagem em
// 1000 linhas: esta lista só cresce com o tempo, nunca vai caber inteira
// numa página só pra sempre.
export async function getAccountAuditLog(accountId: string, page: number): Promise<{ rows: AccountAuditLogRow[]; totalCount: number }> {
  const serviceClient = createServiceClient();

  const offset = (page - 1) * ACCOUNT_ACTIVITY_PAGE_SIZE;
  const { data, error, count } = await serviceClient
    .from("audit_log")
    .select("id, actor_user_id, action_type, target_type, target_id, details, created_at", { count: "exact" })
    .eq("account_id", accountId)
    .not("action_type", "in", "(login,logout)")
    .order("created_at", { ascending: false })
    .range(offset, offset + ACCOUNT_ACTIVITY_PAGE_SIZE - 1);
  if (error) throw new Error(`Falha ao buscar atividade da conta: ${error.message}`);

  const rows = data ?? [];
  const actorIds = [...new Set(rows.map((r) => r.actor_user_id).filter((id): id is string => id !== null))];

  // Nome do ator resolvido à parte — mesmo padrão de get-user-audit-log.ts
  // (Database type deste projeto não tem metadados de relacionamento, um
  // embed tipado do PostgREST não é confiável aqui).
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
