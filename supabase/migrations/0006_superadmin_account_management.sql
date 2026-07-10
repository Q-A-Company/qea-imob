-- Etapa 12: painel de gestão de clientes pelo SuperAdmin.

-- Notas internas do SuperAdmin sobre a conta (texto livre, nunca exposto a
-- Admin/Usuario — só a policy superadmin_full_access dá acesso de escrita,
-- e nenhuma tela fora de /superadmin/* seleciona essa coluna).
alter table public.accounts add column internal_notes text;

-- report_generations (histórico de relatórios gerados) fica de fora desta
-- migration de propósito: item 5 do pedido original da Etapa 12 ainda
-- depende de uma decisão de produto não tomada (o que exatamente conta
-- como "gerar um relatório" — clique em Imprimir/Exportar vs. simplesmente
-- abrir a tela com filtros aplicados). Não faz sentido criar schema para
-- uma decisão pendente.
