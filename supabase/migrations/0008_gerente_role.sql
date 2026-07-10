-- Novo nível de cargo "gerente", entre admin e usuario — mesmas
-- capacidades funcionais de admin (Concorrentes, Configurações,
-- gestão de Usuários) exceto um teto: só gerencia usuário role 'usuario'
-- (não cria/gerencia outro 'gerente' nem 'admin'). Essa restrição fina
-- (quem pode gerenciar quem) é aplicada na aplicação (Server Actions), não
-- aqui — RLS aqui só amplia o "pode escrever na própria conta" que já
-- existia pra 'admin', pra também valer pra 'gerente'.
--
-- Rótulos exibidos ao usuário mudaram (Admin -> "Diretor / T.I", usuario ->
-- "Corretor") mas os valores técnicos de role continuam os mesmos
-- ('admin', 'usuario') — só 'gerente' é literalmente novo. Ver
-- apps/web/lib/supabase/types.ts (ROLE_LABEL).

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('superadmin', 'admin', 'gerente', 'usuario'));

-- profiles: admin_manage_account_profiles já usava current_role() = 'admin'
-- pra decidir quem gerencia profiles da própria conta — amplia pra incluir
-- gerente. A restrição "gerente só mexe em usuario" fica pras Server
-- Actions (apps/web/lib/users/actions.ts).
drop policy "admin_manage_account_profiles" on public.profiles;
create policy "admin_manage_account_profiles" on public.profiles
  for all using (
    account_id = public.current_account_id() and public.current_role() in ('admin', 'gerente')
  ) with check (
    account_id = public.current_account_id() and public.current_role() in ('admin', 'gerente')
  );

-- competitors, site_configs, properties, notification_settings: mesma
-- ampliação — gerente tem as mesmas capacidades de admin nessas tabelas
-- (Concorrentes/Configurações), sem exceção fina nenhuma aqui.
drop policy "admin_manage" on public.competitors;
create policy "admin_manage" on public.competitors
  for all using (
    account_id = public.current_account_id() and public.current_role() in ('admin', 'gerente')
  ) with check (
    account_id = public.current_account_id() and public.current_role() in ('admin', 'gerente')
  );

drop policy "admin_manage" on public.site_configs;
create policy "admin_manage" on public.site_configs
  for all using (
    public.current_role() in ('admin', 'gerente')
    and competitor_id in (select id from public.competitors where account_id = public.current_account_id())
  ) with check (
    public.current_role() in ('admin', 'gerente')
    and competitor_id in (select id from public.competitors where account_id = public.current_account_id())
  );

drop policy "admin_manage" on public.properties;
create policy "admin_manage" on public.properties
  for all using (
    public.current_role() in ('admin', 'gerente')
    and competitor_id in (select id from public.competitors where account_id = public.current_account_id())
  ) with check (
    public.current_role() in ('admin', 'gerente')
    and competitor_id in (select id from public.competitors where account_id = public.current_account_id())
  );

drop policy "admin_manage" on public.notification_settings;
create policy "admin_manage" on public.notification_settings
  for all using (
    account_id = public.current_account_id() and public.current_role() in ('admin', 'gerente')
  ) with check (
    account_id = public.current_account_id() and public.current_role() in ('admin', 'gerente')
  );
