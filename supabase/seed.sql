-- Seed de desenvolvimento — Realestate Monitor
--
-- IMPORTANTE: usuários de autenticação (auth.users) não são criados aqui.
-- O Supabase Auth precisa gerar o hash de senha e demais metadados, então
-- o fluxo correto é:
--
--   1. Criar o primeiro usuário SuperAdmin pelo Dashboard do Supabase
--      (Authentication > Users > Add user) ou via Admin API
--      (supabase.auth.admin.createUser).
--   2. Copiar o UUID do usuário criado e rodar:
--
--      insert into public.profiles (id, account_id, role, full_name)
--      values ('<uuid-do-usuario>', null, 'superadmin', 'Nome do SuperAdmin');
--
-- A partir do painel /superadmin, esse usuário poderá criar contas de
-- imobiliárias (accounts) e convidar Admins — que por sua vez convidam
-- usuários "usuario" da própria conta.

-- Conta de demonstração para desenvolvimento local -------------------------

insert into public.accounts (id, name, active)
values ('00000000-0000-0000-0000-000000000001', 'Imobiliária Demo', true)
on conflict (id) do nothing;

insert into public.notification_settings (account_id, email_enabled, whatsapp_enabled, site_enabled)
values ('00000000-0000-0000-0000-000000000001', false, false, true)
on conflict (account_id) do nothing;

-- Após criar o usuário Admin de demonstração via Supabase Auth, vincule o
-- perfil dele à conta acima:
--
--   insert into public.profiles (id, account_id, role, full_name)
--   values ('<uuid-do-usuario-admin>', '00000000-0000-0000-0000-000000000001', 'admin', 'Admin Demo');
