-- accounts.active não tinha nenhum enforcement real — só era salvo/exibido
-- (bug de segurança real, reportado pelo usuário). current_account_id() é a
-- função usada por praticamente toda policy do projeto na forma
-- `account_id = current_account_id()` — ajustá-la pra retornar NULL quando
-- a conta está inativa propaga o bloqueio pra todas as tabelas de uma vez,
-- sem precisar editar policy por policy. `NULL = qualquer coisa` nunca é
-- verdadeiro em SQL, então toda policy que depende disso passa a negar
-- acesso automaticamente.
--
-- Isso é a rede de segurança pra chamadas diretas ao Supabase (RLS) — o
-- bloqueio "de verdade" pro fluxo normal do app é em lib/auth/dal.ts
-- (getProfile) e lib/auth/actions.ts (login), que checam accounts.active
-- explicitamente antes de deixar passar. A policy "self_select" em
-- profiles (id = auth.uid()) não depende de current_account_id(), então
-- sozinha essa mudança de RLS NÃO bloquearia getProfile() — os dois
-- precisam existir juntos.
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
  where p.id = auth.uid() and a.active = true;
$$;
