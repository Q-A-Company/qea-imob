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
// próxima reavaliação alcançar). Não é "duração + 1min". Usado tanto pro
// piso de segurança exibido no seletor (nunca deixa escolher manualmente
// abaixo disso) quanto pelo gatilho de SUBIDA do ajuste automático.
export const SAFETY_MULTIPLIER = 2;

// Histerese do ajuste automático bidirecional (packages/scraper/jobs/
// check-competitor.ts) — sobe com SAFETY_MULTIPLIER (2x, reage rápido,
// segurança em primeiro lugar), mas só desce quando a folga já é maior
// (3x, não só o mínimo) — cria uma "banda morta" entre os dois limiares,
// evitando um concorrente na fronteira de um degrau ficar subindo e
// descendo a cada checagem. Decisão confirmada com o usuário (não é
// usado no piso de segurança do seletor — esse continua em
// SAFETY_MULTIPLIER puro, é uma trava de segurança pra escolha manual,
// não faz sentido ele ficar mais permissivo).
export const DECREASE_SAFETY_MULTIPLIER = 3;

export interface MinimumSafeInterval {
  minutes: AvailableIntervalMinutes;
  // false só quando a duração é tão grande que nem o maior degrau
  // disponível (o último de AVAILABLE_INTERVALS_MINUTES) garante a
  // margem pedida — nenhum concorrente real bate nisso hoje (o maior
  // mede ~4min hoje), mas o chamador precisa saber pra avisar em vez de
  // aceitar silenciosamente uma margem que não é a prometida.
  marginGuaranteed: boolean;
}

export function minimumSafeIntervalMinutes(durationMs: number, multiplier: number = SAFETY_MULTIPLIER): MinimumSafeInterval {
  const requiredMinutes = (durationMs * multiplier) / 60_000;
  const fit = AVAILABLE_INTERVALS_MINUTES.find((minutes) => minutes >= requiredMinutes);
  if (fit !== undefined) return { minutes: fit, marginGuaranteed: true };
  const largest = AVAILABLE_INTERVALS_MINUTES[AVAILABLE_INTERVALS_MINUTES.length - 1]!;
  return { minutes: largest, marginGuaranteed: false };
}

// Mediana (não média) das últimas execuções limpas — pedido explícito do
// usuário ao tornar o ajuste automático bidirecional: a média deixa uma
// única execução lenta (contenção pontual de rede/host) puxar o intervalo
// pra cima mesmo com as outras duas rápidas; a mediana ignora esse tipo de
// outlier isolado, tanto pra cima quanto pra baixo. Mesma função pros dois
// consumidores (ajuste automático em check-competitor.ts e piso de
// segurança do seletor em admin/competitors/page.tsx) — fonte única,
// documentada como tal desde o início deste arquivo.
export function medianDurationMs(durations: number[]): number {
  if (durations.length === 0) return 0;
  const sorted = [...durations].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}
