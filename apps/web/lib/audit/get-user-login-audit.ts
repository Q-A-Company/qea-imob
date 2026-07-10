import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

export interface LoginAuditRow {
  id: string;
  loggedInAt: string;
  ipAddress: string | null;
  browser: string | null;
  browserVersion: string | null;
  os: string | null;
  isMobile: boolean | null;
  screenWidth: number | null;
  screenHeight: number | null;
}

const RECENT_LIMIT = 25;

// Service role + filtro manual por account_id/user_id — mesmo raciocínio de
// getAccountUser (lib/users/get-account-users.ts): accountId já chega aqui
// validado pelo caller (requireRole + sessão, no lado Admin/Gerente; URL já
// atrás de requireRole("superadmin") no lado SuperAdmin), então filtrar
// manualmente é seguro e evita ter que trocar de client conforme o viewer —
// a policy RLS de leitura desta tabela nem cobre SuperAdmin de propósito
// (ver comentário em supabase/migrations/0013_login_audit_log.sql: "SuperAdmin
// usa client de service role nas telas dele").
//
// Sem paginação incremental — mostra só os 25 mais recentes. A aba
// "Acessos" é uma consulta de apoio/forense, não um fluxo primário; "carregar
// mais" pode ser adicionado depois se isso virar uma necessidade real.
//
// accountId nulo = SuperAdmin vendo o PRÓPRIO perfil (/profile) — SuperAdmin
// não tem account_id (profiles.account_id é null pra ele), e em SQL
// "NULL = NULL" nunca é verdadeiro, então .eq("account_id", null) não
// encontraria as próprias linhas de login dele; .is() é o operador certo
// pra "account_id IS NULL". Só acontece nesse caso — admin/gerente/usuario
// sempre têm account_id real, e o SuperAdmin olhando o perfil de OUTRA
// pessoa (superadmin/accounts/[id]/...) passa o accountId real dessa conta.
export async function getUserLoginAudit(accountId: string | null, userId: string): Promise<{ rows: LoginAuditRow[]; totalCount: number }> {
  const serviceClient = createServiceClient();

  let query = serviceClient
    .from("login_audit_log")
    .select("id, logged_in_at, ip_address, browser, browser_version, os, is_mobile, screen_width, screen_height", {
      count: "exact",
    })
    .eq("user_id", userId);
  query = accountId === null ? query.is("account_id", null) : query.eq("account_id", accountId);

  const { data, error, count } = await query.order("logged_in_at", { ascending: false }).range(0, RECENT_LIMIT - 1);
  if (error) throw new Error(`Falha ao buscar histórico de acessos: ${error.message}`);

  const rows: LoginAuditRow[] = (data ?? []).map((row) => ({
    id: row.id,
    loggedInAt: row.logged_in_at,
    ipAddress: row.ip_address,
    browser: row.browser,
    browserVersion: row.browser_version,
    os: row.os,
    isMobile: row.is_mobile,
    screenWidth: row.screen_width,
    screenHeight: row.screen_height,
  }));

  return { rows, totalCount: count ?? rows.length };
}
