create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users (id) on delete set null,
  account_id uuid references public.accounts (id) on delete cascade,
  -- text livre, sem check constraint: a lista de action_type é uma
  -- taxonomia que vai crescer — um enum/check exigiria migration toda vez
  -- que um novo tipo de ação surgir. Valores conhecidos até agora: login,
  -- logout, user_created, user_role_changed, user_blocked, user_unblocked,
  -- user_deleted, user_password_reset, settings_updated, report_generated,
  -- competitor_created, competitor_status_changed, competitor_interval_changed,
  -- competitor_check_triggered, account_status_changed, account_notes_updated.
  action_type text not null,
  target_type text,
  target_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_account_idx on public.audit_log (account_id, created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_user_id, created_at desc);

alter table public.audit_log enable row level security;

create policy "account_managers_read_audit_log" on public.audit_log
  for select using (
    public.current_role() in ('admin', 'gerente')
    and account_id = public.current_account_id()
  );

create policy "self_insert_audit_log" on public.audit_log
  for insert with check (
    actor_user_id = auth.uid()
    and (account_id is null or account_id = public.current_account_id())
  );
