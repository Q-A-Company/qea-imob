-- Mesmo bug de 0017 (login_audit_log), só que em audit_log: a policy
-- original (0014) exige account_id = current_account_id(), que nunca é
-- verdadeiro quando um SuperAdmin grava uma ação sobre uma conta alheia
-- (current_account_id() do SuperAdmin é sempre NULL — não tem account_id
-- em profiles — e o account_id gravado aqui é o da conta gerenciada, não
-- NULL, então nem a cláusula "account_id is null" ajuda). Resultado:
-- nenhuma ação do SuperAdmin (mudar cargo, bloquear, excluir, resetar
-- senha, criar usuário, mudar status/notas de conta) gravava linha em
-- audit_log — o insert falhava silenciosamente (best-effort, só loga no
-- console, não derruba a ação de negócio).
drop policy "self_insert_audit_log" on public.audit_log;

create policy "self_insert_audit_log" on public.audit_log
  for insert with check (
    actor_user_id = auth.uid()
    and (
      public.is_superadmin()
      or account_id is null
      or account_id = public.current_account_id()
    )
  );
