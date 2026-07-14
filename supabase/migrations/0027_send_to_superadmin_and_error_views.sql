-- Fluxo explícito de "enviar pra revisão do SuperAdmin": até aqui, um
-- cadastro com cobertura baixa (version=1, ver 0026) já aparecia pro
-- SuperAdmin automaticamente, sem o Admin decidir isso — pedido do usuário
-- pra mudar: só aparece depois de um clique explícito ("Enviar para o
-- SuperAdmin"). null = ainda não enviado (não aparece na revisão do
-- SuperAdmin); preenchido = timestamp de quando foi enviado.
-- Recalibração incompatível (version>1) não usa esta coluna — continua
-- aparecendo automaticamente pro SuperAdmin como sempre (comportamento da
-- Etapa 7, não mudou).
alter table public.site_configs add column sent_to_superadmin_at timestamptz;

-- Rastreia a última vez que CADA SuperAdmin visitou o Relatório de Erros de
-- CADA conta — usado pro aviso/sinalização na navegação ("erro novo desde a
-- última visita"). Por usuário (não só por conta) porque pode haver mais de
-- um SuperAdmin, cada um com seu próprio "já vi isso".
create table public.superadmin_error_report_views (
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  viewed_at timestamptz not null,
  primary key (user_id, account_id)
);

alter table public.superadmin_error_report_views enable row level security;

-- Só o próprio SuperAdmin lê/escreve sua própria linha de "última vez que
-- vi" — nunca a de outro SuperAdmin. FOR ALL (não só select) porque a
-- própria página de erros faz upsert nesta tabela ao carregar.
create policy "superadmin_manage_own_error_views" on public.superadmin_error_report_views
  for all using (
    public.is_superadmin() and user_id = auth.uid()
  ) with check (
    public.is_superadmin() and user_id = auth.uid()
  );
