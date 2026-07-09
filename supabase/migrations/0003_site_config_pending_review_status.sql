-- Adiciona o status 'pendente_revisao' a site_configs: quando uma
-- recalibração automática (self-healing, Etapa 7) gerar um novo config cujo
-- external_id seja estruturalmente incompatível com o config anterior (ver
-- packages/scraper/ai/site-config-compatibility.ts), o novo config deve ser
-- salvo com esse status em vez de 'ativo' — a recalibração NÃO deve trocar
-- sozinha a extração de um jeito que arrisque quebrar a continuidade de
-- property_changes. Precisa de aprovação humana (SuperAdmin) antes de virar
-- 'ativo'.

alter table public.site_configs drop constraint site_configs_status_check;

alter table public.site_configs
  add constraint site_configs_status_check
  check (status in ('ativo', 'degradado', 'aprendendo', 'pendente_revisao'));
