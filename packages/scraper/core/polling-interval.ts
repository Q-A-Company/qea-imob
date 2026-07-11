// Régua de intervalo de checagem adaptativo — pedido do usuário: em vez de
// uma tabela de faixas fixas escritas à mão (que tem pontos fracos nas
// bordas — ex: "duração de 8min → mínimo 10min" só garante 1,25x de
// margem, quase "duração + 1min"), uma REGRA proporcional (intervalo ≥
// SAFETY_MULTIPLIER × duração) arredondada pra CIMA até o menor degrau
// disponível que já satisfaça essa proporção. A tabela "até 2,5min→5,
// 2,5-5min→10, 5-7,5min→15..." é uma CONSEQUÊNCIA da fórmula, não algo
// escrito à mão — mudar SAFETY_MULTIPLIER ou os degraus disponíveis
// recalcula tudo sozinho, sem precisar re-escrever faixas.
//
// Fonte única — reaproveitada tanto por check-competitor.ts (decide
// quando subir polling_interval_minutes sozinho) quanto pelo seletor de
// intervalo na tela (apps/web/app/(dashboard)/admin/competitors/
// interval-select.tsx, desabilita opções abaixo do mínimo seguro daquele
// concorrente específico) — apps/web já importa de "scraper/*" livremente
// (ver package.json "exports": "./*": "./dist/*.js"), então não duplica
// a lista em dois lugares.
export const AVAILABLE_INTERVALS_MINUTES = [5, 10, 15, 30, 40, 60] as const;
export type AvailableIntervalMinutes = (typeof AVAILABLE_INTERVALS_MINUTES)[number];

// Intervalo precisa ser pelo menos o dobro da duração medida — metade do
// intervalo é gasto checando, a outra metade é folga de verdade (rede
// lenta num dia, contenção no host, crescimento do catálogo até a
// próxima reavaliação alcançar). Não é "duração + 1min".
export const SAFETY_MULTIPLIER = 2;

export interface MinimumSafeInterval {
  minutes: AvailableIntervalMinutes;
  // false só quando a duração é tão grande que nem o maior degrau
  // disponível (o último de AVAILABLE_INTERVALS_MINUTES) garante 2x de
  // margem — nenhum concorrente real bate nisso hoje (o maior mede ~4min
  // hoje), mas o chamador precisa saber pra avisar em vez de aceitar
  // silenciosamente uma margem que não é a prometida.
  marginGuaranteed: boolean;
}

export function minimumSafeIntervalMinutes(durationMs: number): MinimumSafeInterval {
  const requiredMinutes = (durationMs * SAFETY_MULTIPLIER) / 60_000;
  const fit = AVAILABLE_INTERVALS_MINUTES.find((minutes) => minutes >= requiredMinutes);
  if (fit !== undefined) return { minutes: fit, marginGuaranteed: true };
  const largest = AVAILABLE_INTERVALS_MINUTES[AVAILABLE_INTERVALS_MINUTES.length - 1]!;
  return { minutes: largest, marginGuaranteed: false };
}
