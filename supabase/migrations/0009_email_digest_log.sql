-- Resumo diário por e-mail (substitui o e-mail por mudança individual —
-- ver core/notify.ts). Tabela própria, não reaproveita `notifications`
-- (que alimenta o sino) — o sino continua instantâneo, por mudança,
-- exatamente como hoje; o resumo diário é um canal separado, e misturar os
-- dois na mesma tabela poluiria o dropdown do sino com uma linha de tipo
-- diferente. `unique(account_id, digest_date)` evita envio duplicado se o
-- job rodar mais de uma vez pro mesmo dia.
create table public.email_digest_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  digest_date date not null,
  total_changes integer not null,
  competitor_breakdown jsonb not null,
  recipients_count integer not null,
  sent_at timestamptz not null default now(),
  unique (account_id, digest_date)
);

create index email_digest_log_account_id_idx on public.email_digest_log (account_id, digest_date desc);

alter table public.email_digest_log enable row level security;

create policy "superadmin_full_access" on public.email_digest_log
  for all using (public.is_superadmin()) with check (public.is_superadmin());

create policy "account_members_select" on public.email_digest_log
  for select using (account_id = public.current_account_id());

grant select on public.email_digest_log to authenticated;
