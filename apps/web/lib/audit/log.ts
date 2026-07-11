import "server-only";
import { createClient } from "@/lib/supabase/server";

// action_type conhecidos até agora (lista aberta, sem enum no banco — ver
// comentário em supabase/migrations/0014_audit_log.sql): login, logout,
// user_created, user_role_changed, user_blocked, user_unblocked,
// user_deleted, user_password_reset, user_password_changed,
// user_avatar_updated, user_avatar_removed, user_updated, settings_updated,
// report_generated, competitor_created, competitor_status_changed,
// competitor_interval_changed, competitor_check_triggered,
// account_status_changed, account_notes_updated.
export async function logAuditEvent(params: {
  actorUserId: string;
  accountId: string | null;
  actionType: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("audit_log").insert({
    actor_user_id: params.actorUserId,
    account_id: params.accountId,
    action_type: params.actionType,
    target_type: params.targetType ?? null,
    target_id: params.targetId ?? null,
    details: params.details ?? null,
  });
  // Auditoria é best-effort, de propósito — nunca deve derrubar a ação de
  // negócio que já aconteceu antes desta chamada em todo ponto de
  // instrumentação. Se o insert falhar, loga no console do servidor e
  // segue; não faz throw, não desfaz a ação principal.
  if (error) console.error(`Falha ao gravar audit_log (${params.actionType}):`, error.message);
}
