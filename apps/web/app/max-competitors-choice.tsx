"use client";

const PRESETS = [5, 10, 15] as const;

type Mode = "preset" | "custom" | "infinito";

function modeFor(value: number | null): Mode {
  if (value === null) return "infinito";
  if ((PRESETS as readonly number[]).includes(value)) return "preset";
  return "custom";
}

// Compartilhado entre o formulário de criação de conta (superadmin/
// create-account-form.tsx) e o editor em Configurações da conta
// (superadmin/accounts/[id]/max-competitors-editor.tsx) — mesma UI, dois
// contextos diferentes de submit (form nativo vs. Server Action direta),
// por isso é totalmente controlado (value/onChange), sem estado próprio.
export function MaxCompetitorsChoice({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  const mode = modeFor(value);

  function handleSelect(next: string) {
    if (next === "infinito") {
      onChange(null);
      return;
    }
    if (next === "custom") {
      // Preserva o número já digitado se já estava em modo custom; senão
      // começa de 1 (não de um preset, pra não confundir com a opção fixa).
      onChange(mode === "custom" && value !== null ? value : 1);
      return;
    }
    onChange(Number(next));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={mode === "preset" ? String(value) : mode}
        onChange={(e) => handleSelect(e.target.value)}
        className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-signal"
      >
        {PRESETS.map((preset) => (
          <option key={preset} value={preset}>
            {preset} concorrentes
          </option>
        ))}
        <option value="custom">Outra quantidade</option>
        <option value="infinito">Sem limite</option>
      </select>
      {mode === "custom" && (
        <input
          type="number"
          min={1}
          step={1}
          value={value ?? ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange(Number.isFinite(n) && n > 0 ? Math.trunc(n) : 1);
          }}
          placeholder="Quantidade"
          className="w-28 rounded-md border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-signal"
        />
      )}
    </div>
  );
}
