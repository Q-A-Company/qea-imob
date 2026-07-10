-- A policy original (0013) exigia account_id = current_account_id() sem
-- tratar NULL — SuperAdmin não tem account_id (nem em profiles, nem
-- portanto em current_account_id()), e em SQL "NULL = NULL" não é
-- verdadeiro, então todo login de SuperAdmin violaria a policy e o insert
-- em login_audit_log falharia silenciosamente (best-effort, não derruba o
-- login, mas o registro nunca seria gravado). Mesmo tratamento null-safe
-- que audit_log (0014) já tinha desde o início.
drop policy "self_insert_login_audit" on public.login_audit_log;

create policy "self_insert_login_audit" on public.login_audit_log
  for insert with check (
    user_id = auth.uid()
    and (account_id is null or account_id = public.current_account_id())
  );
