-- Lock por concorrente contra checagens sobrepostas — sem isso, o
-- scheduler (apps/worker, protegido contra sobrepor consigo mesmo via
-- setTimeout recursivo) ainda podia rodar concorrentemente com um clique
-- manual em "Verificar agora" (checkCompetitorNowAction chama
-- checkCompetitor() direto, fora do loop do worker) pro MESMO concorrente.
-- Adquirido via UPDATE condicional atômico (checkCompetitor.ts) — não é
-- "ler o valor, depois decidir, depois escrever" (teria uma corrida entre
-- os dois passos), é um único UPDATE ... WHERE que só afeta a linha se
-- ainda estiver livre, e o retorno (afetou linha ou não) já é a resposta
-- de quem ganhou o lock.
alter table public.competitors
  add column check_started_at timestamptz;
