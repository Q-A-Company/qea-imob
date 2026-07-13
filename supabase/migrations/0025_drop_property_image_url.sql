-- Remove a coluna image_url (camada 2 de identificação de imóvel removido
-- sem reference_code, introduzida em 0024) — decisão do usuário de não
-- guardar mais foto nenhuma dos imóveis. Todos os valores já existentes
-- foram zerados (UPDATE via service role) antes desta migration; a coluna
-- em si só é removida aqui porque não há acesso de DDL direto ao Postgres
-- nesta sessão (mesma limitação já registrada na migration 0024) — precisa
-- ser aplicada manualmente. attributes (camada 3) continua existindo e em
-- uso normalmente, não é afetada por esta mudança.
alter table public.properties drop column image_url;
