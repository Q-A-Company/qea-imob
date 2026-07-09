-- Adiciona abbreviation a competitors: rótulo curto e estável usado como
-- identificação em gráficos (ex: gráfico de pizza por concorrente na Etapa
-- 10) — a cor de cada concorrente é derivada de um hash de competitor_id
-- (determinístico, não precisa de coluna própria), mas o rótulo textual
-- precisa ser algo definido pelo Admin, não um UUID.
--
-- Nullable primeiro, backfill do concorrente já existente (Muller Imóveis,
-- criado via seed-demo-competitor.ts), só depois NOT NULL — senão o ALTER
-- falha em qualquer linha existente sem valor.

alter table public.competitors add column abbreviation text;

update public.competitors set abbreviation = 'MUL' where name = 'Muller Imóveis' and abbreviation is null;

alter table public.competitors alter column abbreviation set not null;

alter table public.competitors
  add constraint competitors_abbreviation_length
  check (char_length(abbreviation) between 1 and 6);
