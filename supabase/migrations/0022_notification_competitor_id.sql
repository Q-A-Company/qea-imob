-- Habilita mostrar o avatar do concorrente (abreviação + cor categórica,
-- ver lib/categorical-colors.ts) em toda notificação — nem toda
-- notificação tem property_change_id (concorrente pausado por circuit
-- breaker, config degradado, recalibração pendente/confirmada não têm),
-- então rastrear o concorrente via property_changes.property_id não cobre
-- esses casos. competitor_id direto cobre os 7 pontos que criam
-- notificação (packages/scraper/jobs/check-competitor.ts,
-- recalibrate-site-config.ts) uniformemente.
--
-- Nullable: notificações antigas (antes desta migration) ficam sem —
-- mostram um fallback neutro na UI, não precisam de backfill.
-- on delete cascade (não set null, diferente de property_change_id): se o
-- concorrente em si foi apagado permanentemente, a notificação sobre ele
-- não faz mais sentido standalone — mesmo raciocínio já aplicado a
-- properties/site_configs, que também cascateiam com o concorrente.
alter table public.notifications
  add column competitor_id uuid references public.competitors (id) on delete cascade;

create index notifications_competitor_id_idx on public.notifications (competitor_id);
