-- change_type explícito em property_changes — antes disso, o "tipo" de
-- cada linha era inferido de quais colunas estavam nulas (old_status/
-- new_status ambos nulos = preço; preenchidos = disponibilidade). Isso
-- fica frágil quando um evento novo ("adicionado") também precisa de
-- old_status/new_status nulos (mesmo formato de "preço") — sem uma coluna
-- própria, não dava pra distinguir os dois de jeito nenhum.
--
-- Backfill retroativo: só 8 linhas reais existem hoje, todas classificáveis
-- sem ambiguidade pela mesma lógica de inferência antiga — nenhuma vira
-- 'other'/desconhecido. Confirmado contra dados reais antes de escrever
-- esta migration (não presumido).
alter table public.property_changes add column change_type text;

update public.property_changes set change_type = case
  when old_status is null and new_status is null then 'price'
  when old_status = 'ativo' and new_status = 'possivelmente_vendido' then 'removed'
  when old_status = 'possivelmente_vendido' and new_status = 'ativo' then 'reappeared'
end;

alter table public.property_changes alter column change_type set not null;
alter table public.property_changes add constraint property_changes_change_type_check
  check (change_type in ('price', 'added', 'removed', 'reappeared'));
