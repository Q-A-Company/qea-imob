alter table public.profiles add column birth_date date;
alter table public.profiles add column block_reason text;
alter table public.profiles add column avatar_url text;

-- block_reason guarda só o motivo do bloqueio ATUAL (pra exibir na tela de
-- edição); o histórico de motivos ao longo do tempo fica no audit_log
-- (0014), que é o lugar certo pra isso — não duplicamos histórico aqui.

-- avatar_url: upload nesta rodada é feito pelo Admin/Gerente editando OUTRO
-- usuário, via Server Action com client de service role (mesmo padrão já
-- usado pelas outras mutações de usuário) — não precisa de GRANT de
-- self-update pra funcionar. Deixo o grant abaixo mesmo assim, barato e
-- deixa o caminho pronto caso decidamos abrir upload próprio (self-service)
-- no futuro.
create policy "self_update_avatar" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

grant update (avatar_url) on public.profiles to authenticated;
