"use client";

import { useState, useTransition } from "react";
import { updateAccountExpirationAction } from "./actions";
import { AccountExpirationChoice } from "@/app/account-expiration-choice";
import { formatExpirationStatus, isExpired, type ExpirationChoice } from "@/lib/accounts/expiration";

// Mesmo padrão de MaxCompetitorsEditor — estado local + botão chamando a
// Server Action direto. Diferente daquele: o valor escolhido aqui é sempre
// uma AÇÃO ("aplicar esta duração a partir de agora"), nunca reflete
// accessExpiresAt de volta (ver comentário em lib/accounts/expiration.ts)
// — por isso o status atual é mostrado como texto separado, só leitura.
export function AccountExpirationEditor({ accountId, initialAccessExpiresAt }: { accountId: string; initialAccessExpiresAt: string | null }) {
  const [accessExpiresAt, setAccessExpiresAt] = useState(initialAccessExpiresAt);
  const [choice, setChoice] = useState<ExpirationChoice>({ kind: "months", months: 1 });
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function handleApply() {
    setStatus("idle");
    setError(null);
    startTransition(async () => {
      const result = await updateAccountExpirationAction(accountId, choice);
      if (result.error) {
        setStatus("error");
        setError(result.error);
      } else {
        setStatus("saved");
        // Reflete na hora sem esperar um novo carregamento da página —
        // aproximação client-side do mesmo cálculo de computeExpiresAt
        // (lib/accounts/expiration.ts), só pro texto de status atualizar.
        if (choice.kind === "none") {
          setAccessExpiresAt(null);
        } else {
          const next = new Date();
          if (choice.kind === "months") next.setUTCMonth(next.getUTCMonth() + choice.months);
          else next.setUTCDate(next.getUTCDate() + choice.days);
          setAccessExpiresAt(next.toISOString());
        }
      }
    });
  }

  const expired = isExpired(accessExpiresAt);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-surface-border bg-surface p-4">
      <span className="text-xs font-medium text-muted">Tempo de acesso</span>
      <p className={`text-sm ${expired ? "text-erro-texto" : "text-foreground"}`} role={expired ? "alert" : undefined}>
        {formatExpirationStatus(accessExpiresAt)}
        {accessExpiresAt && ` (${new Date(accessExpiresAt).toLocaleDateString("pt-BR")})`}
      </p>
      <AccountExpirationChoice value={choice} onChange={setChoice} />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleApply}
          disabled={isPending}
          className="w-fit rounded-md border border-surface-border px-3 py-1.5 text-sm text-foreground hover:bg-background disabled:opacity-60"
        >
          {isPending ? "Aplicando..." : "Aplicar"}
        </button>
        {status === "saved" && <span className="text-xs text-sucesso-texto">Salvo.</span>}
        {status === "error" && (
          <span className="text-xs text-erro-texto" role="alert">
            {error}
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted">
        Sempre conta a partir de agora, mesmo que ainda falte tempo — não soma em cima do que já tinha. Quando expira,
        a imobiliária fica bloqueada até você aplicar um novo tempo aqui (independente do botão &quot;Ativar/Desativar
        conta&quot; acima).
      </p>
    </div>
  );
}
