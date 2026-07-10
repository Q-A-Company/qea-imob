create table public.login_audit_log (
  id uuid primary key default gen_random_uuid(),
  -- on delete set null (não cascade): o registro de acesso é evidência de
  -- segurança e deve sobreviver mesmo se o usuário for excluído depois.
  user_id uuid references auth.users (id) on delete set null,
  account_id uuid references public.accounts (id) on delete cascade,
  logged_in_at timestamptz not null default now(),
  ip_address text,   -- text, não inet: cabeçalhos tipo x-forwarded-for atrás
                      -- de proxy podem vir com múltiplos IPs ou formato
                      -- inesperado; inet rejeitaria o insert nesses casos.
  user_agent text,
  browser text,
  browser_version text,
  os text,
  is_mobile boolean,
  screen_width integer,
  screen_height integer
);

create index login_audit_log_account_idx on public.login_audit_log (account_id, logged_in_at desc);
create index login_audit_log_user_idx on public.login_audit_log (user_id, logged_in_at desc);

alter table public.login_audit_log enable row level security;

-- Leitura: Admin/Gerente veem os acessos da própria conta (aba "Acessos").
-- SuperAdmin usa client de service role nas telas dele, então não precisa
-- de policy própria aqui.
create policy "account_managers_read_login_audit" on public.login_audit_log
  for select using (
    public.current_role() in ('admin', 'gerente')
    and account_id = public.current_account_id()
  );

-- Escrita: só o próprio usuário pode gravar sua própria linha de login,
-- e só account_id que bate com o perfil dele — impede um usuário forjar
-- login em nome de outro ou de outra conta.
create policy "self_insert_login_audit" on public.login_audit_log
  for insert with check (
    user_id = auth.uid() and account_id = public.current_account_id()
  );
