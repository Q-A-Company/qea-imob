-- Q&A Imob — schema inicial
-- Tabelas, funções auxiliares de RLS e políticas.

create extension if not exists "pgcrypto";

-- =========================================================================
-- TABELAS
-- =========================================================================

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete cascade,
  role text not null check (role in ('superadmin', 'admin', 'usuario')),
  full_name text,
  created_at timestamptz not null default now(),
  constraint profiles_account_required_unless_superadmin
    check (role = 'superadmin' or account_id is not null)
);

create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  listing_url text not null,
  polling_interval_minutes integer not null default 5 check (polling_interval_minutes > 0),
  status text not null default 'ativo' check (status in ('ativo', 'pausado', 'erro')),
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.site_configs (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.competitors (id) on delete cascade,
  selectors jsonb not null,
  version integer not null default 1,
  confidence_score numeric,
  status text not null default 'aprendendo' check (status in ('ativo', 'degradado', 'aprendendo')),
  last_validated_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.competitors (id) on delete cascade,
  external_id text not null,
  current_price numeric,
  price_status text not null check (price_status in ('valor', 'sob_consulta')),
  url text not null,
  last_seen_at timestamptz not null default now(),
  status text not null default 'ativo' check (status in ('ativo', 'possivelmente_vendido')),
  created_at timestamptz not null default now(),
  unique (competitor_id, external_id)
);

create table public.property_changes (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  old_price numeric,
  new_price numeric,
  old_status text,
  new_status text,
  detected_at timestamptz not null default now()
);

create table public.notification_settings (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  email_enabled boolean not null default false,
  whatsapp_enabled boolean not null default false,
  site_enabled boolean not null default true
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  property_change_id uuid references public.property_changes (id) on delete set null,
  title text not null,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.scraper_runs (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.competitors (id) on delete cascade,
  run_type text not null check (run_type in ('checagem', 'recalibracao')),
  success boolean not null,
  properties_captured integer not null default 0,
  changes_detected integer not null default 0,
  error_message text,
  created_at timestamptz not null default now()
);

create table public.restricted_leads (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  competitor_name text not null,
  cnpj text,
  start_date date not null,
  expiration_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- ÍNDICES
-- =========================================================================

create index profiles_account_id_idx on public.profiles (account_id);
create index competitors_account_id_idx on public.competitors (account_id);
create index site_configs_competitor_id_idx on public.site_configs (competitor_id);
create index properties_competitor_id_idx on public.properties (competitor_id);
create index property_changes_property_id_idx on public.property_changes (property_id);
create index property_changes_detected_at_idx on public.property_changes (detected_at desc);
create index notifications_account_id_read_idx on public.notifications (account_id, read);
create index scraper_runs_competitor_id_idx on public.scraper_runs (competitor_id);
create index restricted_leads_account_id_idx on public.restricted_leads (account_id);

-- =========================================================================
-- TRIGGER: criação automática de profiles
--
-- Não há self-signup público — todo auth.users é criado por um processo
-- confiável (SuperAdmin criando Admin, Admin convidando Usuario, ou o
-- primeiro SuperAdmin via Dashboard/Admin API) que deve passar role e
-- account_id em raw_user_meta_data (options.data no supabase-js), ex:
--   supabase.auth.admin.createUser({
--     email, password,
--     user_metadata: { role: 'admin', account_id, full_name }
--   })
-- Se o metadata estiver incompleto (ex: role != 'superadmin' sem
-- account_id), o insert falha por causa da constraint
-- profiles_account_required_unless_superadmin, o que aborta a criação do
-- auth.users inteira — não sobra usuário órfão sem profile.
-- =========================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, account_id, role, full_name)
  values (
    new.id,
    nullif(new.raw_user_meta_data->>'account_id', '')::uuid,
    coalesce(new.raw_user_meta_data->>'role', 'usuario'),
    new.raw_user_meta_data->>'full_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================================
-- FUNÇÕES AUXILIARES DE RLS
-- (security definer para evitar recursão de RLS ao consultar a própria
-- tabela profiles dentro das policies)
-- =========================================================================

create or replace function public.is_superadmin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'superadmin'
  );
$$;

create or replace function public.current_account_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select account_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- =========================================================================
-- RLS
-- =========================================================================

alter table public.accounts enable row level security;
alter table public.profiles enable row level security;
alter table public.competitors enable row level security;
alter table public.site_configs enable row level security;
alter table public.properties enable row level security;
alter table public.property_changes enable row level security;
alter table public.notification_settings enable row level security;
alter table public.notifications enable row level security;
alter table public.scraper_runs enable row level security;
alter table public.restricted_leads enable row level security;

-- accounts ---------------------------------------------------------------

create policy "superadmin_full_access" on public.accounts
  for all using (public.is_superadmin()) with check (public.is_superadmin());

create policy "members_select_own_account" on public.accounts
  for select using (id = public.current_account_id());

-- profiles -----------------------------------------------------------------

create policy "superadmin_full_access" on public.profiles
  for all using (public.is_superadmin()) with check (public.is_superadmin());

create policy "self_select" on public.profiles
  for select using (id = auth.uid());

create policy "account_members_select" on public.profiles
  for select using (account_id = public.current_account_id());

create policy "admin_manage_account_profiles" on public.profiles
  for all using (
    account_id = public.current_account_id() and public.current_role() = 'admin'
  ) with check (
    account_id = public.current_account_id() and public.current_role() = 'admin'
  );

-- competitors ----------------------------------------------------------------

create policy "superadmin_full_access" on public.competitors
  for all using (public.is_superadmin()) with check (public.is_superadmin());

create policy "account_members_select" on public.competitors
  for select using (account_id = public.current_account_id());

create policy "admin_manage" on public.competitors
  for all using (
    account_id = public.current_account_id() and public.current_role() = 'admin'
  ) with check (
    account_id = public.current_account_id() and public.current_role() = 'admin'
  );

-- site_configs -----------------------------------------------------------

create policy "superadmin_full_access" on public.site_configs
  for all using (public.is_superadmin()) with check (public.is_superadmin());

create policy "account_members_select" on public.site_configs
  for select using (
    competitor_id in (select id from public.competitors where account_id = public.current_account_id())
  );

create policy "admin_manage" on public.site_configs
  for all using (
    public.current_role() = 'admin'
    and competitor_id in (select id from public.competitors where account_id = public.current_account_id())
  ) with check (
    public.current_role() = 'admin'
    and competitor_id in (select id from public.competitors where account_id = public.current_account_id())
  );

-- properties ---------------------------------------------------------------

create policy "superadmin_full_access" on public.properties
  for all using (public.is_superadmin()) with check (public.is_superadmin());

create policy "account_members_select" on public.properties
  for select using (
    competitor_id in (select id from public.competitors where account_id = public.current_account_id())
  );

create policy "admin_manage" on public.properties
  for all using (
    public.current_role() = 'admin'
    and competitor_id in (select id from public.competitors where account_id = public.current_account_id())
  ) with check (
    public.current_role() = 'admin'
    and competitor_id in (select id from public.competitors where account_id = public.current_account_id())
  );

-- property_changes -----------------------------------------------------------

create policy "superadmin_full_access" on public.property_changes
  for all using (public.is_superadmin()) with check (public.is_superadmin());

create policy "account_members_select" on public.property_changes
  for select using (
    property_id in (
      select p.id from public.properties p
      join public.competitors c on c.id = p.competitor_id
      where c.account_id = public.current_account_id()
    )
  );

-- notification_settings -----------------------------------------------------

create policy "superadmin_full_access" on public.notification_settings
  for all using (public.is_superadmin()) with check (public.is_superadmin());

create policy "account_members_select" on public.notification_settings
  for select using (account_id = public.current_account_id());

create policy "admin_manage" on public.notification_settings
  for all using (
    account_id = public.current_account_id() and public.current_role() = 'admin'
  ) with check (
    account_id = public.current_account_id() and public.current_role() = 'admin'
  );

-- notifications --------------------------------------------------------------

create policy "superadmin_full_access" on public.notifications
  for all using (public.is_superadmin()) with check (public.is_superadmin());

create policy "account_members_select" on public.notifications
  for select using (account_id = public.current_account_id());

create policy "account_members_update_own" on public.notifications
  for update using (account_id = public.current_account_id())
  with check (account_id = public.current_account_id());

-- scraper_runs -----------------------------------------------------------

create policy "superadmin_full_access" on public.scraper_runs
  for all using (public.is_superadmin()) with check (public.is_superadmin());

create policy "account_members_select" on public.scraper_runs
  for select using (
    competitor_id in (select id from public.competitors where account_id = public.current_account_id())
  );

-- restricted_leads -----------------------------------------------------------
-- Tabela de uso comercial/vendas — somente SuperAdmin gerencia; a conta
-- detentora da exclusividade pode consultar seus próprios registros.

create policy "superadmin_full_access" on public.restricted_leads
  for all using (public.is_superadmin()) with check (public.is_superadmin());

create policy "account_members_select" on public.restricted_leads
  for select using (account_id = public.current_account_id());

-- =========================================================================
-- GRANTS
-- PostgREST só expõe o que for concedido explicitamente às roles da API;
-- RLS continua sendo a camada que restringe linhas visíveis/afetadas.
--
-- service_role (worker/scraper e Server Actions privilegiadas) NÃO precisa
-- de grant aqui: o Supabase já provisiona essa role com BYPASSRLS e acesso
-- total ao schema public por padrão. É a role usada por processos de
-- confiança (packages/scraper, jobs de notificação) via
-- @supabase/supabase-js puro (sem cookies/sessão de usuário) com a
-- SUPABASE_SECRET_KEY — nunca exposta ao browser. `authenticated` (usada
-- pelo publishable key + sessão de login) é quem depende destes grants
-- combinados com RLS para saber o que pode enxergar/alterar.
-- =========================================================================

grant usage on schema public to authenticated;

grant select, insert, update, delete on
  public.accounts,
  public.profiles,
  public.competitors,
  public.site_configs,
  public.properties,
  public.property_changes,
  public.notification_settings,
  public.notifications,
  public.scraper_runs,
  public.restricted_leads
to authenticated;
