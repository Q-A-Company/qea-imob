"use client";

import { useLinkStatus } from "next/link";
import { Spinner } from "@/app/spinner";

// (dashboard)/layout.tsx e superadmin/accounts/[id]/layout.tsx lêem
// cookies()/fazem consulta direta no corpo (getProfile) — sem Cache
// Components, isso BLOQUEIA a navegação inteira sem nunca acionar o
// loading.tsx do mesmo segmento (node_modules/next/dist/docs/.../file-
// conventions/loading.md: "Without Cache Components: Navigation blocks
// until the layout finishes rendering"). useLinkStatus() contorna isso:
// rastreia o estado pending do <Link> pelo lado do client, então mostra
// feedback mesmo quando o servidor está ocupado antes de streamar
// qualquer Suspense. Só funciona dentro de um <Link> (useLinkStatus exige
// ser descendente dele) — cada item de nav recebe sua própria instância,
// mas position:fixed faz o resultado aparecer por cima do <main>, não
// dentro do próprio link. Só o link realmente clicado fica pending por
// vez, então nunca há duas instâncias visíveis ao mesmo tempo.
export function NavPendingOverlay({ pinned }: { pinned: boolean }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <div
      className={`fixed inset-x-0 top-0 bottom-16 z-40 flex items-center justify-center bg-background/80 md:bottom-0 ${
        pinned ? "md:left-56" : "md:left-16"
      }`}
    >
      <Spinner />
    </div>
  );
}
