// Sem "server-only" de propósito — importado tanto por Server Actions
// (createAccountAction, updateAccountExpirationAction) quanto pelo Client
// Component do seletor (account-expiration-choice.tsx), mesmo motivo de
// lib/accounts/types.ts.

export const EXPIRATION_MONTH_PRESETS = [1, 3, 6, 12] as const;
export type ExpirationMonthPreset = (typeof EXPIRATION_MONTH_PRESETS)[number];

// Representa uma ESCOLHA de duração (não um valor armazenado) — "1 mês"
// sempre significa "expira daqui a 1 mês a partir de AGORA", nunca soma em
// cima de uma expiração anterior (decisão confirmada com o usuário: mais
// simples de prever do que lógica de "crédito" tipo pré-pago). Por isso não
// existe um jeito de "reverter" um access_expires_at salvo de volta pra uma
// ExpirationChoice — o componente de escolha começa sempre do zero, nunca
// reflete o valor atual da conta (esse é mostrado separado, só como texto).
export type ExpirationChoice = { kind: "none" } | { kind: "months"; months: ExpirationMonthPreset } | { kind: "days"; days: number };

// Aritmética de calendário (setUTCMonth), não "30 dias" fixos — "1 mês" cai
// no mesmo dia do mês seguinte (ou o último dia válido, se o mês seguinte
// for mais curto; comportamento nativo de Date), evitando o drift que uma
// contagem fixa de dias acumularia em contas renovadas repetidamente.
export function computeExpiresAt(choice: ExpirationChoice, now: Date = new Date()): string | null {
  if (choice.kind === "none") return null;
  const date = new Date(now);
  if (choice.kind === "months") {
    date.setUTCMonth(date.getUTCMonth() + choice.months);
  } else {
    date.setUTCDate(date.getUTCDate() + choice.days);
  }
  return date.toISOString();
}

export function parseExpirationChoice(kindRaw: unknown, amountRaw: unknown): { choice?: ExpirationChoice; error?: string } {
  const kind = String(kindRaw ?? "none");
  if (kind === "none") return { choice: { kind: "none" } };

  const amount = Number(String(amountRaw ?? "").trim());
  if (kind === "months") {
    if (!EXPIRATION_MONTH_PRESETS.includes(amount as ExpirationMonthPreset)) {
      return { error: "Duração em meses inválida" };
    }
    return { choice: { kind: "months", months: amount as ExpirationMonthPreset } };
  }
  if (kind === "days") {
    if (!Number.isInteger(amount) || amount <= 0) {
      return { error: "Quantidade de dias precisa ser um número inteiro positivo" };
    }
    return { choice: { kind: "days", days: amount } };
  }
  return { error: "Tipo de duração inválido" };
}

// null = sem expiração. Quantos dias faltam (positivo) ou já se passaram
// (negativo/zero) — Math.ceil pra "faltam menos de 1 dia" não virar 0 (soa
// como já expirado quando ainda não expirou). Base pra formatExpirationStatus
// e pro badge de dias restantes na lista de contas do SuperAdmin.
export function daysUntilExpiration(accessExpiresAt: string | null, now: Date = new Date()): number | null {
  if (accessExpiresAt === null) return null;
  const diffMs = new Date(accessExpiresAt).getTime() - now.getTime();
  const sign = diffMs <= 0 ? -1 : 1;
  return sign * Math.ceil(Math.abs(diffMs) / (24 * 60 * 60 * 1000));
}

// Texto de status pra exibição (settings da conta, lista do SuperAdmin) —
// null = "sem expiração"; passado = "expirado há N dia(s)"; futuro =
// "expira em N dia(s)".
export function formatExpirationStatus(accessExpiresAt: string | null, now: Date = new Date()): string {
  const days = daysUntilExpiration(accessExpiresAt, now);
  if (days === null) return "Sem expiração definida";
  if (days <= 0) return `Expirado há ${-days} ${-days === 1 ? "dia" : "dias"}`;
  return `Expira em ${days} ${days === 1 ? "dia" : "dias"}`;
}

export function isExpired(accessExpiresAt: string | null, now: Date = new Date()): boolean {
  return accessExpiresAt !== null && new Date(accessExpiresAt).getTime() <= now.getTime();
}
