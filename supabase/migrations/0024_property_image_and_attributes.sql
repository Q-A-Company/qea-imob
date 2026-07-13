-- Camadas 2 e 3 de identificação de imóvel removido sem reference_code
-- (camada 1, rótulo a partir do slug de properties.url, não precisa de
-- coluna nova — já é derivado em runtime). image_url: URL da foto principal
-- já presente no card/JSON do site do concorrente (nunca uma foto tirada
-- por nós — só guardamos o link que já veio na resposta baixada, sem
-- requisição extra). attributes: jsonb genérico (não colunas separadas) —
-- mais simples de manter conforme o conjunto de atributos varia por site
-- (uns mostram bairro+quartos+área, outros só bairro, outros nenhum) sem
-- precisar de migration nova a cada combinação; formato esperado (não
-- validado no banco, melhor esforço da extração):
-- { "bairro": string | null, "quartos": string | null, "area": string | null }
-- Ambos nullable e sem índice — só exibição (mesmo padrão de
-- reference_code em 0021), nunca usados em identidade/unicidade/busca.
-- Só valem pra capturas NOVAS a partir de agora — não há como preencher
-- retroativamente pra imóveis já removidos sem esse dado no HTML/JSON
-- que gerou o registro original.
alter table public.properties add column image_url text;
alter table public.properties add column attributes jsonb;
