"use server";

import { requireRole } from "@/lib/auth/dal";
import { logAuditEvent } from "@/lib/audit/log";

// Chamada pelo botão Imprimir/Exportar (print-button.tsx) — não existia
// nenhuma Server Action nesse clique antes (era só window.print() puro no
// cliente). Fire-and-forget: não bloqueia nem depende do resultado da
// impressão em si, só registra que um relatório foi gerado e com quais
// filtros.
export async function logReportGeneratedAction(details: Record<string, unknown>): Promise<void> {
  const profile = await requireRole(["admin", "gerente", "usuario"]);
  await logAuditEvent({
    actorUserId: profile.id,
    accountId: profile.account_id,
    actionType: "report_generated",
    targetType: "report",
    details,
  });
}
