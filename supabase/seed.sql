-- Seed de desenvolvimento — Realestate Monitor
--
-- Usuários de autenticação (auth.users) não são criados aqui. O Supabase
-- Auth precisa gerar o hash de senha e demais metadados. Com o trigger
-- on_auth_user_created (migration 0001), o profile é criado automaticamente
-- a partir do raw_user_meta_data — basta o usuário ser criado já com
-- user_metadata = { role, account_id, full_name }.
--
-- Criar o primeiro SuperAdmin:
--   1. Supabase Dashboard > Authentication > Users > Add user
--   2. Preencher email/senha e, no campo "User Metadata" (JSON), usar:
--      { "role": "superadmin" }
--   3. O trigger cria o profile automaticamente (account_id fica null,
--      permitido pela constraint só para role = 'superadmin').
--
-- Caso o metadata não tenha sido preenchido na criação (ex: usuário
-- convidado por outro fluxo sem passar user_metadata), rode manualmente:
--
--   insert into public.profiles (id, account_id, role, full_name)
--   values ('<uuid-do-usuario>', null, 'superadmin', 'Nome do SuperAdmin')
--   on conflict (id) do update set role = excluded.role;
--
-- A partir do painel /superadmin, esse usuário poderá criar contas de
-- imobiliárias (accounts) e convidar Admins — que por sua vez convidam
-- usuários "usuario" da própria conta, sempre passando role/account_id em
-- user_metadata na chamada de supabase.auth.admin.createUser /
-- inviteUserByEmail.

-- Conta de demonstração para desenvolvimento local -------------------------

insert into public.accounts (id, name, active)
values ('00000000-0000-0000-0000-000000000001', 'Imobiliária Demo', true)
on conflict (id) do nothing;

insert into public.notification_settings (account_id, email_enabled, whatsapp_enabled, site_enabled)
values ('00000000-0000-0000-0000-000000000001', false, false, true)
on conflict (account_id) do nothing;

-- Para criar o Admin de demonstração vinculado a essa conta, crie o
-- usuário via Supabase Auth com:
--   { "role": "admin", "account_id": "00000000-0000-0000-0000-000000000001", "full_name": "Admin Demo" }
-- O trigger cuida do resto.
