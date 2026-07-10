alter table public.scraper_runs add column duration_ms integer;

-- Liga cada property_change à execução que a gerou — sem isso não dá pra
-- responder "quais imóveis mudaram NESTA checagem" ao expandir uma linha do
-- Histórico, só "quais mudaram por volta desse horário" (frágil, quebraria
-- com duas checagens próximas no tempo). on delete set null: se um
-- scraper_run for apagado no futuro (não existe esse fluxo hoje, mas por
-- segurança), o registro da mudança em si continua valendo.
alter table public.property_changes add column scraper_run_id uuid references public.scraper_runs (id) on delete set null;

create index property_changes_scraper_run_idx on public.property_changes (scraper_run_id);
