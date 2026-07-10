import { createServiceClient } from "../core/db.js";
import { sendEmail } from "../core/send-email.js";
import { getAccountRecipients } from "../core/get-account-recipients.js";

const FETCH_PAGE_SIZE = 1000;

interface ChangeTypeCounts {
  price: number;
  added: number;
  removed: number;
  reappeared: number;
}

function emptyChangeTypeCounts(): ChangeTypeCounts {
  return { price: 0, added: 0, removed: 0, reappeared: 0 };
}

interface CompetitorBreakdownEntry {
  competitorId: string;
  competitorName: string;
  changes: number; // total, soma dos 4 tipos
  byType: ChangeTypeCounts;
}

export interface AccountDigestResult {
  accountId: string;
  sent: boolean;
  totalChanges: number;
  breakdown: CompetitorBreakdownEntry[];
  recipientsCount: number;
  skippedReason?: string;
  error?: string;
}

export interface SendDailyDigestResult {
  digestDate: string; // YYYY-MM-DD
  globallyPaused: boolean;
  accountResults: AccountDigestResult[];
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function formatDigestDateLabel(digestDate: string): string {
  // meio-dia UTC evita o dia "escorregar" pro anterior por causa de fuso ao
  // formatar — só usado pro texto exibido, não pra filtrar dados.
  return new Date(`${digestDate}T12:00:00.000Z`).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// basePath depende do cargo de quem recebe — Corretor (usuario) não tem
// acesso a /admin/*, receberia um link que só o redireciona pra fora
// (requireRole rejeitaria). Diretor/T.I e Gerente (admin/gerente) usam o
// mesmo /admin/relatorios.
function reportBasePathForRole(role: string): string {
  return role === "usuario" ? "/user/relatorios" : "/admin/relatorios";
}

function buildReportLink(basePath: string, digestDate: string): string {
  const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  // from=to=digestDate — um único dia, exatamente o que o resumo agregou.
  // parseFilters() (apps/web/app/(dashboard)/admin/relatorios/parse-filters.ts)
  // já lê from/to da URL na carga inicial do Server Component, sem precisar
  // o usuário submeter o formulário manualmente — conferido antes de supor
  // que precisava de algum ajuste.
  return `${appBaseUrl}${basePath}?from=${digestDate}&to=${digestDate}`;
}

// Detalha um competitor: "5 mudanças de preço, 2 adicionados, 1 removido" —
// só os tipos com contagem > 0 aparecem, pra não poluir o caso comum (só
// preço). Mesma ordem/formato de check-now-button.tsx (formatChangesBreakdown).
function describeCompetitorBreakdown(b: CompetitorBreakdownEntry): string {
  const parts: string[] = [];
  if (b.byType.price > 0) parts.push(`${b.byType.price} ${pluralize(b.byType.price, "mudança de preço", "mudanças de preço")}`);
  if (b.byType.added > 0) parts.push(`${b.byType.added} ${pluralize(b.byType.added, "adicionado", "adicionados")}`);
  if (b.byType.removed > 0) parts.push(`${b.byType.removed} ${pluralize(b.byType.removed, "removido", "removidos")}`);
  if (b.byType.reappeared > 0) parts.push(`${b.byType.reappeared} ${pluralize(b.byType.reappeared, "reapareceu", "reapareceram")}`);
  return parts.join(", ");
}

// Exportado separado da função que envia de verdade — permite gerar e
// revisar o texto exato (pedido explícito do usuário, "me mostre o texto
// antes de eu aprovar") sem precisar rodar o envio real toda vez.
export function buildDigestMessage(
  digestDate: string,
  breakdown: CompetitorBreakdownEntry[],
  reportLink: string
): { subject: string; message: string } {
  const total = breakdown.reduce((sum, b) => sum + b.changes, 0);
  const dateLabel = formatDigestDateLabel(digestDate);
  const subject = `Resumo diário — ${dateLabel}`;

  const intro =
    breakdown.length === 1
      ? `Hoje, ${total} ${pluralize(total, "mudança", "mudanças")} no concorrente que você monitora:`
      : `Hoje, ${total} mudanças entre os concorrentes que você monitora:`;

  const lines = [...breakdown]
    .sort((a, b) => b.changes - a.changes)
    .map((b) => `${b.competitorName}: ${describeCompetitorBreakdown(b)}`);

  const message = `${intro}\n\n${lines.join("\n")}\n\nVeja o relatório completo de hoje: ${reportLink}\n\nObrigado por usar o Q&A Imob!`;
  return { subject, message };
}

// Busca paginada — mesma lição do bug de truncagem em ~1000 linhas
// investigado nesta sessão (packages/scraper/jobs/persist-and-compare.ts):
// um .select() sem .range() explícito corta silenciosamente. Nunca filtra
// por .in("property_id", ...)/.in("competitor_id", ...) com uma lista de
// IDs — o mesmo bug de URL gigante (get-dashboard-data.ts) — em vez disso
// busca tudo (paginado) e cruza em JS.
async function fetchAllPaginated<T>(
  fetchPage: (offset: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await fetchPage(offset);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if (!data || data.length < FETCH_PAGE_SIZE) break;
    offset += FETCH_PAGE_SIZE;
  }
  return all;
}

// Roda 1x/dia — chamado manualmente (validação desta etapa) ou por um
// cron externo. Nota: este projeto ainda não tem NENHUM cron de verdade
// implantado (nem as checagens de preço da Etapa 5 têm — getDueCompetitors/
// runDueChecks já existem mas nunca são invocados por nada automático hoje).
// Isso não é uma lacuna nova introduzida aqui.
//
// Substitui o e-mail por mudança individual (removido de core/notify.ts) —
// email_enabled agora só alimenta este resumo agregado. O sino continua
// instantâneo, sem nenhuma mudança.
export async function sendDailyDigest(digestDate: string = new Date().toISOString().slice(0, 10)): Promise<SendDailyDigestResult> {
  const supabase = createServiceClient();

  // Nível 1 — interruptor global (SuperAdmin, migration 0010). Checado
  // ANTES de processar qualquer conta: se estiver desligado, nem chega a
  // consultar accounts/mudanças, só loga que o envio está pausado. Vale
  // pra TODA a plataforma, independente do que cada conta tem em
  // notification_settings.email_enabled.
  const { data: systemSettings, error: systemSettingsError } = await supabase
    .from("system_settings")
    .select("email_globally_enabled")
    .eq("id", true)
    .single();
  if (systemSettingsError) throw new Error(`Falha ao buscar configurações do sistema: ${systemSettingsError.message}`);
  if (!systemSettings.email_globally_enabled) {
    return { digestDate, globallyPaused: true, accountResults: [] };
  }

  const dayStart = `${digestDate}T00:00:00.000Z`;
  const dayEnd = new Date(new Date(dayStart).getTime() + 24 * 60 * 60 * 1000).toISOString();

  const { data: accountsWithEmail, error: accountsError } = await supabase
    .from("notification_settings")
    .select("account_id")
    .eq("email_enabled", true);
  if (accountsError) throw new Error(`Falha ao buscar contas com e-mail habilitado: ${accountsError.message}`);

  if (!accountsWithEmail || accountsWithEmail.length === 0) {
    return { digestDate, globallyPaused: false, accountResults: [] };
  }

  const competitors = await fetchAllPaginated<{ id: string; account_id: string; name: string }>((offset) =>
    supabase.from("competitors").select("id, account_id, name").range(offset, offset + FETCH_PAGE_SIZE - 1)
  );
  const competitorById = new Map(competitors.map((c) => [c.id, c]));

  const properties = await fetchAllPaginated<{ id: string; competitor_id: string }>((offset) =>
    supabase.from("properties").select("id, competitor_id").range(offset, offset + FETCH_PAGE_SIZE - 1)
  );
  const competitorIdByPropertyId = new Map(properties.map((p) => [p.id, p.competitor_id]));

  const changesToday = await fetchAllPaginated<{ property_id: string; change_type: keyof ChangeTypeCounts }>((offset) =>
    supabase
      .from("property_changes")
      .select("property_id, change_type")
      .gte("detected_at", dayStart)
      .lt("detected_at", dayEnd)
      .range(offset, offset + FETCH_PAGE_SIZE - 1)
  );

  // account_id -> competitor_id -> contagem por change_type
  const countsByAccount = new Map<string, Map<string, ChangeTypeCounts>>();
  for (const change of changesToday) {
    const competitorId = competitorIdByPropertyId.get(change.property_id);
    const competitor = competitorId ? competitorById.get(competitorId) : undefined;
    if (!competitor) continue; // property/competitor removido — ignora, não conta pra ninguém

    const accountCounts = countsByAccount.get(competitor.account_id) ?? new Map<string, ChangeTypeCounts>();
    const competitorCounts = accountCounts.get(competitorId!) ?? emptyChangeTypeCounts();
    competitorCounts[change.change_type]++;
    accountCounts.set(competitorId!, competitorCounts);
    countsByAccount.set(competitor.account_id, accountCounts);
  }

  const accountResults: AccountDigestResult[] = [];

  for (const { account_id: accountId } of accountsWithEmail) {
    const accountCounts = countsByAccount.get(accountId);

    // Sem nenhuma mudança no dia — não envia nada (pedido explícito do
    // usuário: mensagem vazia não agrega valor e ainda gera custo/ruído à toa).
    if (!accountCounts || accountCounts.size === 0) {
      accountResults.push({ accountId, sent: false, totalChanges: 0, breakdown: [], recipientsCount: 0, skippedReason: "sem mudanças no dia" });
      continue;
    }

    // Checa ANTES de enviar se esse dia já foi mandado pra essa conta — o
    // worker (apps/worker) roda num loop contínuo com um guard em memória
    // pra não repetir o envio no mesmo processo, mas isso não sobrevive a
    // um restart (deploy, crash). Essa checagem no banco é o guard de
    // verdade, durável — `upsert` sozinho não bastaria porque ele
    // atualizaria a linha de log, mas o e-mail já teria sido reenviado
    // antes disso.
    const { data: existingLog } = await supabase
      .from("email_digest_log")
      .select("id")
      .eq("account_id", accountId)
      .eq("digest_date", digestDate)
      .maybeSingle();
    if (existingLog) {
      accountResults.push({ accountId, sent: false, totalChanges: 0, breakdown: [], recipientsCount: 0, skippedReason: "resumo deste dia já foi enviado" });
      continue;
    }

    const breakdown: CompetitorBreakdownEntry[] = [...accountCounts.entries()].map(([competitorId, byType]) => ({
      competitorId,
      competitorName: competitorById.get(competitorId)?.name ?? "Concorrente removido",
      changes: byType.price + byType.added + byType.removed + byType.reappeared,
      byType,
    }));
    const totalChanges = breakdown.reduce((sum, b) => sum + b.changes, 0);

    const recipients = await getAccountRecipients(supabase, accountId);
    if (recipients.length === 0) {
      accountResults.push({ accountId, sent: false, totalChanges, breakdown, recipientsCount: 0, skippedReason: "conta sem destinatários" });
      continue;
    }

    // Agrupa por basePath (não por role em si) — Diretor/T.I e Gerente
    // compartilham /admin/relatorios, então na prática isso manda no
    // máximo 2 e-mails por conta (um por basePath distinto entre os
    // destinatários reais), não um por pessoa.
    const emailsByBasePath = new Map<string, string[]>();
    for (const recipient of recipients) {
      const basePath = reportBasePathForRole(recipient.role);
      const list = emailsByBasePath.get(basePath) ?? [];
      list.push(recipient.email);
      emailsByBasePath.set(basePath, list);
    }

    // Falha numa conta (ex: Resend fora do ar, chave inválida) não pode
    // derrubar o resumo das OUTRAS contas — mesmo raciocínio já usado em
    // core/notify.ts antes desta mudança: e-mail é um canal que pode falhar
    // sem travar o resto do fluxo.
    try {
      for (const [basePath, emails] of emailsByBasePath) {
        const reportLink = buildReportLink(basePath, digestDate);
        const { subject, message } = buildDigestMessage(digestDate, breakdown, reportLink);
        await sendEmail({ to: emails, subject, title: subject, message });
      }

      const { error: logError } = await supabase.from("email_digest_log").upsert(
        {
          account_id: accountId,
          digest_date: digestDate,
          total_changes: totalChanges,
          competitor_breakdown: breakdown,
          recipients_count: recipients.length,
        },
        { onConflict: "account_id,digest_date" }
      );
      if (logError) throw new Error(`Falha ao registrar envio do resumo diário: ${logError.message}`);

      accountResults.push({ accountId, sent: true, totalChanges, breakdown, recipientsCount: recipients.length });
    } catch (err) {
      accountResults.push({
        accountId,
        sent: false,
        totalChanges,
        breakdown,
        recipientsCount: recipients.length,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { digestDate, globallyPaused: false, accountResults };
}
