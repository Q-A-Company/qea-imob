import { Check } from "lucide-react";
import type { InputHTMLAttributes } from "react";

// Checkbox custom — substitui o <input type="checkbox"> nativo (sem
// styling nenhum hoje nos filtros de Relatórios, tamanho/borda
// inconsistente no "Lembrar de mim" do login) em todo o app. Técnica:
// input real por cima (appearance-none, opacity-0 — continua clicável,
// focável via teclado e funciona com FormData de formulário nativo
// normalmente), dois elementos decorativos por baixo reagindo ao estado
// via `peer-checked:`/`peer-focus-visible:`/`peer-disabled:` — não
// precisa de estado React próprio, funciona tanto controlado (checked+
// onChange) quanto não-controlado (defaultChecked, caso do login).
//
// Cor do estado marcado é --color-latao (--signal) — decisão do usuário,
// avaliado e aceito o risco de diluir o significado reservado de "mudança
// de preço detectada" nesse caso específico.
type CheckboxProps = { className?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className">;

export function Checkbox({ className = "", ...inputProps }: CheckboxProps) {
  return (
    <span className={`relative inline-flex h-5 w-5 shrink-0 items-center justify-center ${className}`}>
      <input
        type="checkbox"
        className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-md opacity-0 disabled:cursor-not-allowed"
        {...inputProps}
      />
      {/* Desmarcado: borda visível o suficiente pra não parecer apagado —
          border-muted/50 é mais forte que a --surface-border discreta
          usada em cards, de propósito (referência visual pedia contorno
          em destaque, não sutil). Marcado: glow em --signal, mesma
          proporção border/30 + bg/15 já usada no IconChip (tone="erro"). */}
      <span
        className="pointer-events-none absolute inset-0 rounded-md border border-muted/50 bg-background transition-colors peer-checked:border-signal/40 peer-checked:bg-signal/15 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-signal peer-disabled:opacity-50"
        aria-hidden
      />
      <Check
        className="pointer-events-none relative h-3 w-3 text-signal-text opacity-0 transition-opacity peer-checked:opacity-100 peer-disabled:opacity-50"
        aria-hidden
      />
    </span>
  );
}
