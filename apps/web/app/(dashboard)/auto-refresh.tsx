"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Sem Realtime (decisão registrada — infraestrutura nova sem precedente
// no projeto, não testável visualmente por mim). router.refresh() re-busca
// os dados de Server Component da rota ATUAL no servidor e aplica o
// resultado, sem navegação/reload de verdade — preserva estado de client
// component (sidebar fixada, formulários, scroll). Cobre TODA página do
// shell (Feed, KPIs, gráficos, Relatórios, Histórico) com um mecanismo só,
// em vez de cada widget reimplementar seu próprio polling — foi só o sino
// que ganhou um polling próprio antes disso existir; mantido separado dele
// porque o sino também precisa da contagem/lista atualizada mesmo com o
// dropdown fechado, e um refresh de rota cobre isso do mesmo jeito (a
// busca de notificações também roda em layout.tsx).
const REFRESH_INTERVAL_MS = 15_000;

export function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [router]);

  return null;
}
