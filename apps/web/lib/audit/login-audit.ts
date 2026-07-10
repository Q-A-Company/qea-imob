import "server-only";
import { headers } from "next/headers";
import { UAParser } from "ua-parser-js";
import { createClient } from "@/lib/supabase/server";

// x-forwarded-for pode vir com uma lista "cliente, proxy1, proxy2" — o
// primeiro é o mais próximo do cliente real. x-real-ip como fallback
// (alguns proxies só mandam esse). Nenhum dos dois é garantido em todo
// ambiente (dev local não tem proxy na frente), por isso o resultado é
// nullable.
async function getRequestIp(): Promise<string | null> {
  const headersList = await headers();
  const forwardedFor = headersList.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  return headersList.get("x-real-ip");
}

function parseScreenDimension(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// Chamada logo após signInWithPassword ter sucesso, dentro de login()
// (lib/auth/actions.ts) — captura tudo de uma vez: IP/user-agent vêm do
// header da própria requisição de login; resolução de tela vem de dois
// campos ocultos que login-form.tsx preenche via JS (window.screen.width/
// height) antes do submit — é a única informação aqui que só existe no
// navegador, não tem como capturar no servidor.
export async function recordLoginAudit(userId: string, accountId: string | null, formData: FormData): Promise<void> {
  const headersList = await headers();
  const userAgent = headersList.get("user-agent");
  const ip = await getRequestIp();

  const parsed = new UAParser(userAgent ?? "").getResult();
  const isMobile = parsed.device.type === "mobile" || parsed.device.type === "tablet";

  const supabase = await createClient();
  const { error } = await supabase.from("login_audit_log").insert({
    user_id: userId,
    account_id: accountId,
    ip_address: ip,
    user_agent: userAgent,
    browser: parsed.browser.name ?? null,
    browser_version: parsed.browser.version ?? null,
    os: parsed.os.name ?? null,
    is_mobile: isMobile,
    screen_width: parseScreenDimension(formData.get("screenWidth")),
    screen_height: parseScreenDimension(formData.get("screenHeight")),
  });
  // Best-effort, mesmo motivo de logAuditEvent (lib/audit/log.ts) — nunca
  // bloqueia o login em si.
  if (error) console.error("Falha ao gravar login_audit_log:", error.message);
}
