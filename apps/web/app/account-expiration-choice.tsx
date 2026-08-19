"use client";

import { EXPIRATION_MONTH_PRESETS, type ExpirationChoice } from "@/lib/accounts/expiration";

const MONTH_LABEL: Record<number, string> = { 1: "1 mês", 3: "3 meses", 6: "6 meses", 12: "12 meses" };

// Mesmo espírito de max-competitors-choice.tsx (select + input condicional,
// totalmente controlado) — mas representa uma ESCOLHA de duração, não um
// valor armazenado: "1 mês" sempre quer dizer "a partir de agora", nunca
// reflete a expiração atual da conta (ver comentário em
// lib/accounts/expiration.ts). Por isso não tem "value" vindo do banco.
export function AccountExpirationChoice({ value, onChange }: { value: ExpirationChoice; onChange: (v: ExpirationChoice) => void }) {
  function selectValue(): string {
    if (value.kind === "none") return "none";
    if (value.kind === "months") return String(value.months);
    return "days";
  }

  function handleSelect(next: string) {
    if (next === "none") {
      onChange({ kind: "none" });
      return;
    }
    if (next === "days") {
      onChange({ kind: "days", days: value.kind === "days" ? value.days : 30 });
      return;
    }
    onChange({ kind: "months", months: Number(next) as (typeof EXPIRATION_MONTH_PRESETS)[number] });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={selectValue()}
        onChange={(e) => handleSelect(e.target.value)}
        className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-signal"
      >
        {EXPIRATION_MONTH_PRESETS.map((months) => (
          <option key={months} value={months}>
            {MONTH_LABEL[months]}
          </option>
        ))}
        <option value="days">Quantidade de dias</option>
        <option value="none">Sem expiração</option>
      </select>
      {value.kind === "days" && (
        <input
          type="number"
          min={1}
          step={1}
          value={value.days}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange({ kind: "days", days: Number.isFinite(n) && n > 0 ? Math.trunc(n) : 1 });
          }}
          placeholder="Dias"
          className="w-24 rounded-md border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-signal"
        />
      )}
    </div>
  );
}
