-- Nível 1: interruptor global de e-mail (SuperAdmin) — "botão de
-- emergência" pra pausar todo envio de e-mail da plataforma sem depender
-- de redeploy. Singleton: `id boolean primary key default true check
-- (id = true)` garante exatamente 1 linha, sempre — não dá pra inserir
-- uma segunda.
create table public.system_settings (
  id boolean primary key default true check (id = true),
  email_globally_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.system_settings (id) values (true);

alter table public.system_settings enable row level security;

create policy "superadmin_full_access" on public.system_settings
  for all using (public.is_superadmin()) with check (public.is_superadmin());

grant select, update on public.system_settings to authenticated;

-- Nível 2: preferência pessoal de e-mail por usuário — mesmo com a conta
-- tendo email_enabled=true, cada usuário pode desativar o recebimento
-- PRA SI MESMO (não pros outros).
alter table public.profiles add column email_notifications_enabled boolean not null default true;

-- RLS filtra QUAIS linhas (a própria, via id = auth.uid()); o GRANT abaixo
-- restringe QUAIS colunas — sem isso, a policy sozinha deixaria um usuário
-- alterar qualquer campo da própria linha via PATCH direto, inclusive
-- role/account_id (risco de escalonamento de privilégio).
create policy "self_update_email_preference" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

grant update (email_notifications_enabled) on public.profiles to authenticated;
