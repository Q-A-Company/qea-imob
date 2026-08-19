-- Limite máximo de concorrentes monitorados por conta — pedido do usuário
-- pra controlar quantos concorrentes cada imobiliária pode cadastrar
-- (provavelmente atrelado ao plano contratado). null = sem limite
-- (comportamento de hoje, preservado pra toda conta já existente); contas
-- novas escolhem um valor no próprio formulário de criação
-- (createAccountAction), sem precisar de default aqui.
alter table public.accounts
  add column max_competitors integer,
  add constraint accounts_max_competitors_positive check (max_competitors is null or max_competitors > 0);
