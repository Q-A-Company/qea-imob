-- Arquivar concorrente (Etapa de arquivamento/exclusão): novo status
-- 'arquivado' — some da listagem ativa e do scheduler (getDueCompetitors()
-- já filtra .eq("status", "ativo"), então 'arquivado' fica de fora sem
-- nenhuma mudança lá), mas site_configs/properties/property_changes
-- continuam intactos. Reativar volta direto pra 'ativo' (mesma Server
-- Action que já existia para pausar/retomar), sem re-rodar aprendizado via
-- IA — o site_config antigo continua válido.
-- Descobre o nome real da constraint de status em vez de supor
-- "competitors_status_check" (nome padrão do Postgres pra um check() inline
-- em CREATE TABLE, mas não temos como confirmar por introspecção direta
-- neste ambiente) — evita a migration falhar inteira por um nome errado.
do $$
declare
  found_constraint_name text;
begin
  select con.conname into found_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'competitors'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%status%';

  if found_constraint_name is not null then
    execute format('alter table public.competitors drop constraint %I', found_constraint_name);
  end if;
end $$;

alter table public.competitors
  add constraint competitors_status_check check (status in ('ativo', 'pausado', 'erro', 'arquivado'));

-- Impede cadastro duplicado da mesma URL de listagem na mesma conta,
-- independente do status (ativo/pausado/erro/arquivado) — pedido explícito
-- pra evitar recriar um concorrente já arquivado (e reaprender o site à
-- toa) só porque a URL foi digitada com http/https ou barra final
-- diferentes. immutable pra poder virar coluna gerada logo abaixo.
--
-- Normaliza a URL inteira em minúsculas (não só o host) — simplificação
-- aceita: mais simples de manter em sincronia com a normalização em TS
-- (lib/competitors/normalize-url.ts) do que replicar um parser de URL em
-- SQL puro, e path de URL de listagem não costuma ter case sensível
-- relevante na prática.
create or replace function public.normalize_listing_url(url text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    regexp_replace(lower(trim(url)), '^https?://', ''),
    '/+$', ''
  );
$$;

alter table public.competitors
  add column listing_url_normalized text generated always as (public.normalize_listing_url(listing_url)) stored;

alter table public.competitors
  add constraint competitors_account_listing_url_unique unique (account_id, listing_url_normalized);
