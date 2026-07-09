-- Etapa 4 produz stoppedEarlyDueToError (run-price-check.ts) — true quando a
-- extração parou por falha de rede/servidor após esgotar os retries, não por
-- ter legitimamente chegado ao fim da paginação. scraper_runs precisa de um
-- lugar explícito pra esse sinal: sem ele, a Etapa 6 (comparação com cache)
-- não tem como saber se um imóvel ausente na checagem atual sumiu de
-- verdade ou só não foi alcançado por causa da falha — e marcaria
-- "possivelmente_vendido" por engano (falso positivo).

alter table public.scraper_runs
  add column stopped_early_due_to_error boolean not null default false;

comment on column public.scraper_runs.stopped_early_due_to_error is
  'true = execução parou por falha de rede/servidor com dados parciais (ver run-price-check.ts). A Etapa 6 NÃO deve inferir "imóvel removido" a partir de uma execução com esse campo true — só compara/atualiza preço dos imóveis que foram capturados. Contribui para um circuit breaker de falhas consecutivas (Etapa 5), mas NÃO deve, sozinho, disparar recalibração via IA (Etapa 7) — recalibração é para quando a extração respondeu mas os seletores parecem obsoletos (0 imóveis ou maioria sem preço em uma execução completa), não para falha de rede.';
