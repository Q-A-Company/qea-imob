-- Generaliza site_configs para suportar duas estratégias de extração:
-- html_css (seletores CSS via Cheerio, padrão atual) e json_api (endpoint
-- JSON paginado, quando um concorrente expõe um por trás de paginação
-- client-side). A IA (config-generator) só produz html_css por enquanto —
-- json_api é construído manualmente quando alguém descobre esse padrão em
-- um concorrente específico. `selectors` continua jsonb pois o formato
-- interno difere por estratégia.

alter table public.site_configs
  add column extraction_strategy text not null default 'html_css'
    check (extraction_strategy in ('html_css', 'json_api'));
