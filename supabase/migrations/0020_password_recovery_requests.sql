-- Rate limit simples pra recuperação de senha — generateLink via Admin API
-- (service role, ver requestPasswordRecoveryAction em
-- lib/auth/recovery-actions.ts) não passa pelo limitador nativo do GoTrue
-- (esse só se aplica ao endpoint público resetPasswordForEmail, que NÃO
-- estamos usando de propósito — queremos template próprio via Resend, não
-- o e-mail nativo do Supabase). Sem nenhuma policy (RLS habilitada, zero
-- policies = ninguém além de service role acessa) — só a Server Action
-- toca esta tabela, e ela já usa service role pra chamar generateLink de
-- qualquer forma.
create table public.password_recovery_requests (
  email text primary key,
  requested_at timestamptz not null default now()
);

alter table public.password_recovery_requests enable row level security;
