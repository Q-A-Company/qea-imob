-- Expiração de acesso por conta — pedido do usuário pra controlar por
-- quanto tempo uma imobiliária fica ativa (provavelmente atrelado a
-- cobrança/contrato). null = sem expiração (comportamento de hoje,
-- preservado pra toda conta já existente); contas novas escolhem uma
-- duração no formulário de criação (createAccountAction), mas "sem
-- expiração" continua disponível como opção pra qualquer conta a
-- qualquer momento (decisão confirmada com o usuário).
alter table public.accounts add column access_expires_at timestamptz;

-- Mesmo raciocínio de current_account_id() em 0007_enforce_account_active.sql
-- (o comentário lá já explica por que essa função precisa refletir QUALQUER
-- motivo de bloqueio, não só active=false) — agora também nega acesso
-- quando access_expires_at já passou. Rede de segurança pra chamadas
-- diretas ao Supabase; o bloqueio "de verdade" pro fluxo normal do app
-- continua em lib/auth/dal.ts (getProfile) e lib/auth/actions.ts (login),
-- que precisam da MESMA condição adicionada ali também.
create or replace function public.current_account_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select p.account_id
  from public.profiles p
  join public.accounts a on a.id = p.account_id
  where p.id = auth.uid()
    and a.active = true
    and (a.access_expires_at is null or a.access_expires_at > now());
$$;
