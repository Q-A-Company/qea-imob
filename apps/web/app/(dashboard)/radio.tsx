import type { InputHTMLAttributes } from "react";

// Irmão de checkbox.tsx — mesma técnica (input real invisível por cima,
// decoração reagindo via peer-checked/peer-focus-visible/peer-disabled,
// mesmo sistema de cor --signal), só que redondo com um ponto central em
// vez de quadrado com ícone de check — radio é semanticamente diferente
// de checkbox (seleção única dentro de um grupo, não toggle independente),
// então mantém a afordância circular padrão em vez de reaproveitar o
// quadrado só por consistência visual superficial.
type RadioProps = { className?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className">;

export function Radio({ className = "", ...inputProps }: RadioProps) {
  return (
    <span className={`relative inline-flex h-5 w-5 shrink-0 items-center justify-center ${className}`}>
      <input
        type="radio"
        className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full opacity-0 disabled:cursor-not-allowed"
        {...inputProps}
      />
      <span
        className="pointer-events-none absolute inset-0 rounded-full border border-muted/50 bg-background transition-colors peer-checked:border-signal/40 peer-checked:bg-signal/15 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-signal peer-disabled:opacity-50"
        aria-hidden
      />
      <span
        className="pointer-events-none relative h-2 w-2 rounded-full bg-signal-text opacity-0 transition-opacity peer-checked:opacity-100 peer-disabled:opacity-50"
        aria-hidden
      />
    </span>
  );
}
