"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAuditEvent } from "@/lib/audit/log";

export interface UpdateNotificationChannelState {
  error?: string;
  success?: boolean;
  warning?: string;
}

// accountId nunca é parâmetro — vem sempre do profile de quem está logado
// (mesmo motivo de lib/users/actions.ts), Corretor nunca chega aqui porque
// requireRole já barra antes.
export async function updateNotificationChannelAction(
  channel: "site" | "email",
  enabled: boolean
): Promise<UpdateNotificationChannelState> {
  const profile = await requireRole(["admin", "gerente"]);
  const accountId = profile.account_id!;

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("notification_settings")
    .select("site_enabled, email_enabled")
    .eq("account_id", accountId)
    .maybeSingle();

  const { error } = await supabase.from("notification_settings").upsert(
    {
      account_id: accountId,
      site_enabled: channel === "site" ? enabled : (current?.site_enabled ?? true),
      email_enabled: channel === "email" ? enabled : (current?.email_enabled ?? false),
    },
    { onConflict: "account_id" }
  );
  if (error) return { error: `Falha ao salvar: ${error.message}` };

  await logAuditEvent({
    actorUserId: profile.id,
    accountId,
    actionType: "settings_updated",
    targetType: "notification_settings",
    details: { channel, enabled },
  });
  revalidatePath("/admin/settings");

  // Aviso combinado antes: ligar e-mail sem RESEND_API_KEY/RESEND_FROM_EMAIL
  // configurados não deveria parecer que vai funcionar silenciosamente —
  // o Admin/Gerente não controla essa variável de ambiente (é infra, não
  // preferência de conta), então a ação continua salvando a intenção, só
  // avisa que o envio de verdade ainda não vai sair até isso ser configurado.
  const warning =
    channel === "email" && enabled && (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL)
      ? "E-mail habilitado, mas RESEND_API_KEY/RESEND_FROM_EMAIL ainda não estão configurados no ambiente — o resumo diário não vai sair de verdade até isso ser configurado."
      : undefined;

  return { success: true, warning };
}

export interface UpdatePersonalEmailPreferenceState {
  error?: string;
  success?: boolean;
}

// Nível 2 — preferência PESSOAL, qualquer role (admin/gerente/usuario).
// Self-service: sempre a própria linha (profile.id de quem está logado),
// nunca um id vindo de parâmetro/formulário. A policy self_update_email_preference
// + o grant restrito à coluna (migration 0010) fazem o resto — mesmo se
// alguém adulterasse o id no client, RLS só deixaria a própria linha passar.
export async function updatePersonalEmailPreferenceAction(enabled: boolean): Promise<UpdatePersonalEmailPreferenceState> {
  const profile = await requireRole(["admin", "gerente", "usuario"]);

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ email_notifications_enabled: enabled }).eq("id", profile.id);
  if (error) return { error: `Falha ao salvar: ${error.message}` };

  revalidatePath("/admin/settings");
  revalidatePath("/user/settings");
  return { success: true };
}

export interface ClearAccountHistoryState {
  error?: string;
  success?: boolean;
  deletedCount?: number;
}

const FETCH_PAGE_SIZE = 1000;
// 500 causou "TypeError: fetch failed" contra dados reais desta mesma
// sessão (get-run-changes.ts, lib/competitors/actions.ts) — não é um 400 do
// PostgREST, é falha de rede mais cedo, provável limite de tamanho de URL/
// header. Testado empiricamente: 350 funciona, 400 falha. 200 com margem.
const ID_CHUNK_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// Zona de perigo — apaga TODO o histórico de mudanças (property_changes,
// todos os change_types) de TODOS os concorrentes da conta, permanentemente.
// Escopo decidido explicitamente com o usuário antes de implementar:
//   - properties, site_configs, competitors: intactos (imóveis continuam
//     existindo com o estado atual; nenhum reaprendizado via IA é
//     disparado — essa ação nunca toca em site_configs).
//   - scraper_runs: intacto (log técnico de execução, não histórico de
//     mudança — Feed/Relatórios são alimentados por property_changes).
//   - notifications vinculadas às property_changes apagadas: também
//     apagadas (não só desvinculadas via ON DELETE SET NULL) — decisão de
//     coerência: o sino não deveria continuar mostrando mudanças que o
//     Feed/Relatórios não confirmam mais depois da limpeza.
//   - email_digest_log: intacto (log de ENVIO/deduplicação por dia, não
//     histórico de mudança — apagar arriscaria reenvio duplicado do
//     resumo diário pelo worker).
// Restrito a admin (Diretor/T.I) — não gerente — dado o tamanho do
// impacto: conta inteira, todos os concorrentes, irreversível.
export async function clearAccountHistoryAction(): Promise<ClearAccountHistoryState> {
  const profile = await requireRole("admin");
  const accountId = profile.account_id!;
  // Service role, não o cliente RLS-scoped — property_changes/notifications
  // só têm política de RLS para SELECT (e UPDATE, no caso de notifications)
  // para membros da conta; nunca existiu política de DELETE pra eles, só
  // pro SuperAdmin (FOR ALL). Sem isso, o .delete() abaixo roda sem erro
  // mas afeta 0 linhas de verdade (RLS filtra silenciosamente) — bug real
  // reproduzido: a SELECT contava certo, o DELETE não apagava nada. A
  // autorização de verdade já é o requireRole("admin") acima, não a RLS.
  const supabase = createServiceClient();

  const { data: competitors, error: competitorsError } = await supabase.from("competitors").select("id").eq("account_id", accountId);
  if (competitorsError) return { error: `Falha ao buscar concorrentes: ${competitorsError.message}` };
  const competitorIds = (competitors ?? []).map((c) => c.id);

  const propertyIds: string[] = [];
  for (const competitorIdsChunk of chunk(competitorIds, ID_CHUNK_SIZE)) {
    for (let offset = 0; ; offset += FETCH_PAGE_SIZE) {
      const { data, error } = await supabase
        .from("properties")
        .select("id")
        .in("competitor_id", competitorIdsChunk)
        .range(offset, offset + FETCH_PAGE_SIZE - 1);
      if (error) return { error: `Falha ao buscar imóveis: ${error.message}` };
      propertyIds.push(...(data ?? []).map((p) => p.id));
      if (!data || data.length < FETCH_PAGE_SIZE) break;
    }
  }

  let deletedCount = 0;
  for (const propertyIdsChunk of chunk(propertyIds, ID_CHUNK_SIZE)) {
    const changeIds: string[] = [];
    for (let offset = 0; ; offset += FETCH_PAGE_SIZE) {
      const { data, error } = await supabase
        .from("property_changes")
        .select("id")
        .in("property_id", propertyIdsChunk)
        .range(offset, offset + FETCH_PAGE_SIZE - 1);
      if (error) return { error: `Falha ao buscar histórico de mudanças: ${error.message}` };
      changeIds.push(...(data ?? []).map((c) => c.id));
      if (!data || data.length < FETCH_PAGE_SIZE) break;
    }
    deletedCount += changeIds.length;

    for (const changeIdsChunk of chunk(changeIds, ID_CHUNK_SIZE)) {
      const { error } = await supabase.from("notifications").delete().in("property_change_id", changeIdsChunk);
      if (error) return { error: `Falha ao apagar notificações relacionadas: ${error.message}` };
    }

    const { error: deleteChangesError } = await supabase.from("property_changes").delete().in("property_id", propertyIdsChunk);
    if (deleteChangesError) return { error: `Falha ao apagar histórico de mudanças: ${deleteChangesError.message}` };
  }

  await logAuditEvent({
    actorUserId: profile.id,
    accountId,
    actionType: "history_cleared",
    details: { deletedCount, competitorsAffected: competitorIds.length },
  });

  revalidatePath("/admin");
  revalidatePath("/user");
  revalidatePath("/admin/relatorios");
  revalidatePath("/user/relatorios");
  revalidatePath("/admin/history");
  revalidatePath("/user/history");

  return { success: true, deletedCount };
}
