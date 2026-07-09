# packages/scraper

Notas técnicas — não repete o que já está no código, só decisões e limitações que não são óbvias lendo os arquivos isoladamente.

## Estratégias de extração (`site_configs.extraction_strategy`)

- **`html_css`**: seletores CSS via Cheerio sobre o HTML da listagem. É a única estratégia que a IA (`ai/config-generator.ts`) sabe gerar.
- **`json_api`**: endpoint JSON paginado por trás de paginação client-side (AJAX/scroll infinito). Detectado automaticamente por `ai/json-api-detector.ts` quando a cobertura via `html_css` fica muito abaixo de `total_listings_hint` (ver `LOW_COVERAGE_RATIO` em `jobs/learn-site-config.ts`), ou escrito manualmente a partir de payload capturado via DevTools quando a detecção automática não acha nada. Suporta `GET` com paginação por número de página (`{page}` na query string) e `POST` com corpo JSON (`request_body_template`, `{page}` no lugar do valor de paginação) — paginação por offset (`page_increment` = tamanho da página) ou por número sequencial (`page_increment: 1`). `items_field`/`total_field` aceitam caminhos aninhados com `.` (ex: `"response.docs"`).

O fluxo (`jobs/learn-site-config.ts`) sempre tenta `html_css` primeiro; só dispara a detecção de `json_api` se a cobertura parecer baixa (0 cards, ou cards encontrados < 50% do total que a própria página menciona).

## Etapa 4: `jobs/run-price-check.ts` — checagem de rotina, sem IA

Separado de propósito de `learn-site-config.ts`: `run-price-check.ts` recebe uma `site_config` **já salva** (de qualquer uma das duas estratégias) e só executa a extração — nenhuma chamada de IA, nenhuma decisão de estratégia. É o ponto de entrada que o scheduler (Etapa 5) chama a cada `polling_interval_minutes` por concorrente. Internamente é um dispatcher fino sobre `html-paginator.ts` (`html_css`) e `json-api-extractor.ts` (`json_api`) — toda a lógica de paginação/retry/backoff/rate-limit já existia e foi validada na Etapa 3; nada foi duplicado aqui.

Validado: reaprendeu o config de `mullerimoveis.com.br` uma vez (Etapa 3, com IA), depois rodou `runPriceCheck` sozinho contra o mesmo config salvo — 61/61 (100%), zero chamadas de IA no segundo passo, ~2,8s.

**Correção feita durante a Etapa 4**: `html-paginator.ts` usava o mesmo `stoppedReason: "empty_page"` tanto para "chegou ao fim legítimo da paginação" quanto para "uma página falhou depois de esgotar os retries" — duas situações muito diferentes (a segunda é falha real, com dados parciais). Separado em `"no_more_pages"` vs `"fetch_failed"`; `run-price-check.ts` expõe isso como `stoppedEarlyDueToError: boolean` explícito no resultado, para o scheduler/self-healing (Etapas 5/7) saberem distinguir "catálogo inteiro capturado" de "captura incompleta por falha".

## Limitação conhecida: WordPress `admin-ajax.php` + nonce

O detector automático de `json_api` (`ai/json-api-detector.ts`) varre `<script src>` em busca de padrões de endpoint (`api`, `search`, `busca`, `ajax`, etc.) e testa candidatos via **GET**. Isso funciona bem para APIs REST-ish com nome descritivo (ex: `/api/anuncios/search`).

**Não cobre** o padrão mais comum em sites WordPress com JetEngine/Elementor (Loop Grid, Listing Grid): a paginação/scroll infinito chama `/wp-admin/admin-ajax.php` via **POST**, com um `action` específico do plugin e um `_wpnonce` (token de segurança de curta duração, gerado por carregamento de página) no corpo da requisição. Sem o nonce correto, a requisição é rejeitada — e o nonce não pode ser obtido só analisando arquivos `.js` estáticos, precisa ser extraído do HTML/estado da página no momento do carregamento.

Confirmado esse padrão em `cewimoveis.com.br` (JetEngine, `orderby: modified`) durante a validação da Etapa 3 — o detector automático retornou `not_found` porque não há um endpoint GET com nome descritivo, só o dispatcher genérico protegido por nonce.

**Confirmado empiricamente (2026-07-09), não só teorizado**: capturado via DevTools o payload real (`POST /imoveis/?nocache=... action=jet_engine_ajax`, com `query[signature]` de 64 hex chars). Replay exato da signature capturada, na sequência, já falhou (`{"success":false,"data":"Invalid query signature"}`) — inclusive reusando a mesma signature pra uma página diferente. Não é fixa, não é reutilizável, expira rápido. Confirma que não vale a pena investir mais tempo tentando reproduzir esse hash sem uma sessão de browser ao vivo por checagem (o que na prática significa Playwright, não HTTP puro).

**Decisão (2026-07-09)**: não vamos construir suporte a POST+nonce agora — é escopo maior (extrair nonce do HTML/estado inicial, montar o corpo POST no formato específico de cada plugin, lidar com expiração do nonce em checagens periódicas) e foge do "resolver quando aparecer em escala" combinado para a Etapa 3. Para sites nesse padrão, hoje a cobertura fica limitada ao que `html_css` consegue ver na primeira renderização estática (útil quando a ordenação padrão é por recência, como confirmado em `cewimoveis`) — `cewimoveis` fica definitivamente como cobertura parcial (30/810, ~3,7%) até um dia justificar o investimento em Playwright.

## Limitação conhecida: preço só na página de detalhe do imóvel

Em `cutrimimobiliaria.com.br`, 25 de 200 imóveis (12,5%) não têm nenhuma menção de preço no card da listagem — nem valor numérico, nem marcador de "Sob Consulta". O preço provavelmente só existe na página individual do imóvel. Hoje esses casos caem em `price: null, price_status: "sob_consulta"`, **indistinguíveis** dos casos genuínos de "Sob Consulta" (que nesse mesmo site são só 3 de 200). Não existe fallback para visitar a página de detalhe — o produto só busca a página de listagem, por design (ver spec original). Se isso se repetir em escala em contas reais, vale considerar marcar esses casos com um terceiro estado (`price_status: "desconhecido"` ou similar) em vez de reaproveitar `sob_consulta`, para não subestimar silenciosamente a cobertura real de monitoramento de preço.

## Geração de site_config pela IA não é 100% determinística — mitigado

Rodando `generateSiteConfig` três vezes seguidas contra o mesmo HTML de `cutrimimobiliaria.com.br`, uma das três vezes a IA mapeou `external_id` para o texto completo do título do card (que inclui o preço) em vez da URL do imóvel — as outras duas vezes voltou ao mapeamento correto (URL). O `confidence_score` variou entre 0.25 e 0.45 nas três rodadas, para o mesmo HTML.

**Por que importa**: `external_id` é a chave usada para casar "é o mesmo imóvel de antes?" entre checagens (`properties.competitor_id + properties.external_id` é UNIQUE). Se uma recalibração de self-healing (Etapa 7) gerar um `site_config` que mapeia `external_id` de forma estruturalmente diferente da versão anterior, todo o histórico de preço da conta para aquele concorrente vira "imóveis novos" na próxima checagem — a continuidade quebra silenciosamente, sem ninguém perceber.

**Mitigação implementada (2026-07-09), duas camadas:**

1. **Prompt** (`ai/config-generator.ts`): instrução explícita e restritiva — `external_id` deve vir de um código/referência visível ou do slug/ID da URL; nunca de título, descrição, ou qualquer campo que possa conter preço/formatação variável. Reduz a chance do problema, mas prompt sozinho não é garantia com LLM.
2. **Validação em código** (`ai/site-config-compatibility.ts`), defesa em profundidade — não depende do prompt ter funcionado:
   - `checkExternalIdSanity(config)`: roda em **todo** `site_config` gerado (cadastro inicial ou recalibração), antes de qualquer outra coisa. Rejeita quando `external_id` usa exatamente o mesmo seletor/campo do `price`. Conectado em `jobs/learn-site-config.ts` — se falhar, `confidence_score` é rebaixado para no máximo 0.2 e um warning `[VALIDAÇÃO AUTOMÁTICA]` é injetado; o resultado carrega `externalIdSanityOk: false` explicitamente (não é só mais um item em `warnings`).
   - `checkExternalIdCompatibility({ previous, next })`: compara a *forma* de extração do `external_id` (tipo de atributo, ou campo do JSON) entre um config já ativo e um recém-gerado. Pronta para a Etapa 7 usar: quando a recalibração automática rodar, **deve** chamar essa função antes de qualquer substituição e, se `compatible: false`, salvar o novo `site_config` com `status = 'pendente_revisao'` (valor já adicionado ao constraint em `0003_site_config_pending_review_status.sql`) em vez de ativar sozinha — precisa de aprovação humana (SuperAdmin) antes de virar `ativo`. A Etapa 7 ainda não existe (não há trigger de recalibração automática no código hoje), então não há risco vivo agora — mas a função já está pronta, testada (`scripts/test-sanity-unit.ts` prova as duas checagens contra o bug real observado), e é obrigatória no momento em que a Etapa 7 for implementada.

Validado: 3 rodadas consecutivas pós-hardening do prompt voltaram todas com `external_id` via `href` (estável) e `sanityOk: true`. O caso ruim foi reproduzido deliberadamente em `scripts/test-sanity-unit.ts` para provar que a rede de segurança em código pega o problema mesmo se o prompt falhar.

### ✅ RESOLVIDO (2026-07-10): falso positivo em `checkExternalIdSanity` — era pré-requisito bloqueante da Etapa 7

**Estava registrado como bloqueante, não "nice to have".** Descoberto em 2026-07-09 ao semear `mullerimoveis.com.br` como concorrente de demonstração (fora de um teste automatizado, em uso real): `checkExternalIdSanity` rebaixou `confidence_score` para `0.2` mesmo com um `site_config` correto.

Causa: a checagem em `ai/site-config-compatibility.ts` (linha ~27) rejeita sempre que `external_id.attribute === "text" && price.attribute === "text"` — **mesmo quando os seletores CSS são completamente diferentes**. No caso real:

```
external_id: { selector: ".imovelcard__info__ref strong", attribute: "text" }  // "Ref: XXXX", estável
price:       { selector: ".imovelcard__valor__valor", attribute: "text" }       // preço, seletor distinto
```

Isso é o mesmo padrão de `external_id` já validado com 61/61 (100%) na Etapa 4 — não é o bug real que a checagem foi desenhada para pegar (`external_id` acidentalmente igual ao `price`, ou capturando título/preço junto). A heurística testa "os dois campos usam texto livre?" quando deveria testar "os dois campos vêm do **mesmo** seletor (ou se sobrepõem)?" — `attribute === "text"` sozinho não indica sobreposição, é o jeito normal de extrair tanto referência quanto preço na maioria dos sites.

**Por que isso bloqueia a Etapa 7, não é só um incômodo cosmético**: a Etapa 7 (self-healing) vai usar exatamente esse sinal para decidir se recalibra via IA automaticamente. Um falso positivo faz `confidence_score` cair para `0.2` num `site_config` perfeitamente funcional — se a Etapa 7 usar esse `confidence_score` (ou o próprio `sanityOk: false`) como gatilho de recalibração, ela vai disparar chamadas de IA desnecessárias em produção para configs que não têm nada de errado. Custo real, recorrente, silencioso.

**Correção aplicada**: `checkExternalIdSanity` não testa mais "os dois campos usam texto livre?" — testa se um seletor é **ancestral do outro no DOM** (`isAncestorSelector`, comparação por prefixo de combinador de descendência). É o mecanismo real do bug original: `.text()` do Cheerio num elemento ancestral inclui o texto de todos os descendentes, então só faz sentido sinalizar quando há essa relação estrutural — não quando dois seletores irmãos, sem relação nenhuma, simplesmente extraem texto cada um o seu.

Regressão adicionada em `scripts/test-sanity-unit.ts`: o caso real do `mullerimoveis` (seletores distintos, não sobrepostos) agora passa `compatible: true`; um novo caso sintético de sobreposição genuína (`price` aninhado dentro do seletor de `external_id`) continua sendo rejeitado. 5/5 asserções passando.

## Requisito para as Etapas 5/6/7 (scheduler, comparação, self-healing — ainda não implementadas): `stoppedEarlyDueToError`

`run-price-check.ts` (Etapa 4) retorna `stoppedEarlyDueToError: boolean` — true quando a extração parou por falha de rede/servidor (após esgotar retries), não por chegar ao fim legítimo da paginação. `scraper_runs.stopped_early_due_to_error` (migration `0004`) existe especificamente pra carregar esse sinal até o banco. Contrato obrigatório para quem implementar as próximas etapas:

1. **Etapa 6 (comparação com cache / `property_changes`)**: quando a execução tiver `stopped_early_due_to_error = true`, **não** inferir que imóveis ausentes nessa checagem foram removidos/vendidos — a lógica de "sumiu da listagem → `possivelmente_vendido`" só vale para execuções completas. Imóveis que **foram** capturados nessa mesma execução (mesmo parcial) continuam sendo comparados/atualizados normalmente — só a inferência por *ausência* é que fica bloqueada.
2. **Etapa 5 (scheduler)**: `stopped_early_due_to_error = true` conta como falha para um circuit breaker de falhas de rede consecutivas por concorrente (pausar + notificar SuperAdmin depois de N seguidas). **Implementado** — ver seção "Etapa 5" abaixo (`N = 3`).
3. **Etapa 7 (self-healing)**: `stopped_early_due_to_error` **não** deve, sozinho, disparar recalibração via IA. O gatilho de recalibração (`site_configs.status = 'degradado'`) é especificamente para quando a extração respondeu por completo mas capturou 0 imóveis ou a maioria sem preço — isso indica seletor obsoleto. Uma falha de rede não diz nada sobre se os seletores ainda estão corretos; recalibrar nesse caso desperdiçaria uma chamada de IA sem corrigir nada.
4. **`scraper_runs`**: toda chamada de `run-price-check.ts` deve gravar uma linha em `scraper_runs` com `stopped_early_due_to_error` fiel ao que o job retornou — não é opcional, é o registro de auditoria que Etapas 5/6/7 e o painel SuperAdmin (Etapa 12) dependem para funcionar corretamente.

## Requisito da Etapa 10 (telas de admin) — atendido

A prévia de extração mostrada ao Admin precisa exibir explicitamente **"X de Y imóveis capturados (Z%)"** — não só a lista de itens da amostra. `Y` vem de `total_listings_hint` (estratégia `html_css`) ou do campo de total confirmado (estratégia `json_api`); quando `Y` for desconhecido, mostrar isso como tal ("total desconhecido"), não omitir.

**Fluxo de confirmação em duas telas** (`apps/web/lib/competitors/actions.ts` + `apps/web/app/(dashboard)/admin/competitors/register-form.tsx`): `registerCompetitorAction` cadastra o concorrente e roda `learnSiteConfig` no mesmo submit, mas salva o `site_config` com `status = 'pendente_revisao'` — **não ativa sozinho**. A tela mostra cobertura ("X de Y"), confiança e warnings; o Admin decide `confirmSiteConfigAction` (vira `'ativo'`) ou `discardSiteConfigAction` (apaga concorrente + config, cascade). `check-competitor.ts` já só considera `site_configs` com `status = 'ativo'`, então `pendente_revisao` fica automaticamente de fora das checagens sem precisar de nenhuma mudança ali — reaproveita o mesmo status já criado na Etapa 3/usado na Etapa 7, sem migration nova.

Minha primeira versão deste fluxo (2026-07-10) ativava direto no mesmo submit, sem revisão — decisão consciente na hora, mas que eu só documentei em comentário/README em vez de perguntar antes de implementar, apesar de ser exatamente o requisito de segurança que este parágrafo já registrava desde a Etapa 3. Corrigido a pedido do usuário depois de ele apontar isso, citando evidência concreta já vista neste projeto (Débora 0%, CEW 3,7% de cobertura) — o risco de ativar um `site_config` ruim sem revisão não era hipotético.

## Gestão de concorrentes já cadastrados: pausar/retomar e editar intervalo

`apps/web/app/(dashboard)/admin/competitors/status-toggle.tsx` e `interval-select.tsx` — controles inline na listagem, além do que já existia só no cadastro inicial.

**Pausar/retomar não é cosmético**: confirmado lendo `packages/scraper/jobs/scheduler.ts` antes de construir o botão (não assumido) — `getDueCompetitors()` já filtra `.eq("status", "ativo")` desde a Etapa 5, então um concorrente `'pausado'` nunca é retornado, nunca é passado pra `checkCompetitor()`. O botão só expõe uma mutação que já tinha efeito real no scheduler. "Verificar agora" continua funcionando propositalmente em concorrente pausado — é o fluxo de recuperação da Etapa 5 (se der certo, reativa sozinho).

**Intervalo editável, só 4 opções fixas** (5/10/30/60 min) — `ALLOWED_POLLING_INTERVALS` em `apps/web/lib/competitors/actions.ts`, validado tanto em `updateCompetitorIntervalAction` quanto em `registerCompetitorAction` (o cadastro inicial usava número livre antes, corrigido pro mesmo `<select>`). Nenhuma migration nova: `getDueCompetitors()` já lê `polling_interval_minutes` direto do banco a cada execução, sem cache, então a mudança vale a partir do próximo tick do scheduler automaticamente.

**Validado** (script de validação descartado depois de usar): concorrente sintético com `last_checked_at` controlado manualmente, isolando cada variável — devido com intervalo de 5min/checado há 10min ✅; **não** devido enquanto pausado (mesmo cenário, só o status muda) ✅; devido de novo ao retomar ✅; **não** devido depois de aumentar o intervalo pra 60min (mesmo `last_checked_at`) ✅; devido de novo ao voltar pra 5min, sem reiniciar nada ✅.

Validado com IA real (script de validação descartado depois de usar, a pedido do usuário — não fica como regressão neste repo): `pendente_revisao` logo após aprender, confirmar vira `ativo` com `last_validated_at` preenchido, descartar apaga concorrente e `site_config` via cascade.

## imobiliariaveleiros.com.br: resolvido via json_api (POST + offset)

Payload capturado via DevTools: `POST /api/service/consult`, corpo JSON com `start`/`numRows` (paginação por offset, não número de página) e `sortList: ["moreRecentsSales"]`. Validado empiricamente antes de escrever a config (não assumido):

- **Sem cookie/autenticação**: funciona idêntico com e sem o cookie `cookieMold=true` visto no DevTools — não é obrigatório.
- **Sem slug de URL na resposta**: os itens só trazem dados estruturados (`idtProperty`, `namCity`, `namDistrict`, `valSales`, etc.), nenhum campo de URL/slug. Testado e confirmado: `GET /imovel/{idtProperty}` retorna **301** direto pra URL canônica completa (`/imovel/venda/{tipo}/{cidade}/{bairro}/{id}`) — evita ter que reconstruir o slug manualmente a partir de categoria/cidade/bairro (frágil: acentuação, pluralização, etc.).
- **Resultado**: 334 de 335 imóveis reais (99,7%), sem duplicatas, contra os 12/335 (3,6%) da estratégia `html_css` anterior.

**O 1 item faltante é reproduzível, não acaso**: `start=12` retorna consistentemente **11** itens em vez de 12 (confirmado em duas varreduras completas separadas, mesma página, mesmo resultado; sem overlap/duplicata em nenhuma outra página). É uma peculiaridade do backend deles nesse offset específico — não um bug na nossa paginação (zero overlaps, zero duplicatas confirmados varrendo página a página). 99,7% é o teto real hoje, não um bug pra caçar.

`price_unavailable_field` não foi confirmado (não achamos nenhum item "sob consulta" na amostra pra validar contra `flgHideValSaleSite`) — fica registrado como warning no config; se aparecer um caso real sem preço numérico que não seja `flgHideValSaleSite`, revisar.

## Lição sobre coleta em catálogos grandes (`json-api-extractor.ts`)

Durante a validação contra `sentineliesobral.com.br` (1.409 imóveis, ~118 páginas), a extração completa falhava de forma consistente entre as páginas 60-77 com HTTP 500 — não era timeout de rede do nosso lado nem bloqueio por IP (as mesmas páginas voltavam a responder 200 minutos depois, mesmo sem mudar nada na nossa requisição). O comportamento sugere o backend deles sob carga com o volume de requisições sequenciais rápidas.

Duas mudanças resolveram, juntas (nenhuma sozinha foi suficiente):
1. Retry com backoff exponencial por página (5 tentativas, até ~15s de espera) — necessário mas não suficiente sozinho.
2. Espaçamento de ~400ms entre páginas bem-sucedidas (`DELAY_BETWEEN_PAGES_MS`) — reduz a taxa de requisição para não provocar a instabilidade em primeiro lugar.

Com as duas, a extração completa (118 páginas) rodou sem nenhum erro e capturou 1.409/1.409 (100%). Vale como referência para calibrar o scheduler de rotina (Etapa 5) em outros sites com catálogos grandes.

## Etapa 5: scheduler + fila + botão "Verificar agora"

Escopo desta etapa é só "preparar o terreno" (decisão explícita, 2026-07-09): roda `run-price-check.ts` (Etapa 4) de forma agendada/manual, grava `scraper_runs` corretamente e implementa o circuit breaker de falhas de rede. **Não** faz nenhuma inferência de "imóvel sumiu = vendido" nem gera `property_changes` — isso é Etapa 6, ainda não existe. `changes_detected` fica sempre `0` por enquanto.

- **`jobs/scheduler.ts`** (`getDueCompetitors`): lê todos os concorrentes com `status = 'ativo'` e filtra em memória os que já passaram do próprio `polling_interval_minutes` desde `last_checked_at` (ou nunca foram checados). Sem fila persistente (Redis/BullMQ) — decisão consciente para o estágio atual do produto; ver `run-due-checks.ts`.
- **`jobs/check-competitor.ts`** (`checkCompetitor(competitorId)`): orquestra uma checagem completa para 1 concorrente — busca o `site_config` ativo mais recente, chama `runPriceCheck`, decide o circuit breaker, grava `scraper_runs`, atualiza `last_checked_at`. É a função que tanto o scheduler automático quanto o botão manual "Verificar agora" chamam — mesmo caminho de código nos dois casos, sem lógica duplicada.
  - **Circuit breaker de falhas de rede** (`CONSECUTIVE_FAILURE_THRESHOLD = 3`): conta `scraper_runs.stopped_early_due_to_error` mais recentes em ordem decrescente de `created_at`, parando no primeiro `false`. Na 3ª falha consecutiva, o concorrente vira `status = 'pausado'` e uma notificação é inserida em `notifications` para a conta. **Separado** do gatilho de recalibração via IA (Etapa 7, que ainda não existe) — falha de rede não diz nada sobre seletores obsoletos.
  - **Falha total** (exceção lançada por `runPriceCheck`, ex: DNS/timeout antes de capturar qualquer página) conta como `stoppedEarlyDueToError = true` pelo mesmo motivo que falha parcial conta: não dá pra saber se os imóveis ausentes sumiram de verdade ou só não foram alcançados.
  - **Reativação automática**: se um concorrente `pausado` (pelo circuit breaker) for checado manualmente via "Verificar agora" e a checagem for bem-sucedida sem `stoppedEarlyDueToError`, o `status` volta pra `ativo` sozinho. Só reativa nesse caso específico — nunca sobrescreve uma pausa manual feita por outro motivo.
- **`jobs/run-due-checks.ts`**: varre `getDueCompetitors()` e processa em lotes de `CONCURRENCY = 3` via `Promise.allSettled` (uma falha em um concorrente não derruba os outros). Sem Redis/BullMQ — é um processador batch simples, chamado por um cron/worker externo (fora do escopo desta etapa rodar esse cron de verdade).

**Validado contra Supabase real** (`scripts/test-etapa5-seed-and-check.ts`, competitor de teste criado e removido depois): fluxo completo aprende→semeia→`getDueCompetitors`→`checkCompetitor`→confere `scraper_runs`→confere `last_checked_at`→confere exclusão da lista de pendentes — 7/7 passos ok.

**Circuit breaker validado com falha forçada** (`scripts/test-etapa5-circuit-breaker.ts`): concorrente com URL inexistente de propósito, checado 3x — pausou e notificou exatamente na 3ª tentativa (não antes, não depois). Depois, URL corrigida + `site_config` válido trocado: checagem seguinte reativou o concorrente sozinha. Ambos os lados do contrato confirmados, não só o caminho feliz.

### Botão "Verificar agora": Server Action + página mínima

`apps/web/lib/competitors/actions.ts` (`checkCompetitorNowAction`) e `apps/web/app/(dashboard)/admin/competitors/`. Versão deliberadamente mínima (lista + botão, sem cadastro/preview de IA/configurações — isso é Etapa 10). Ponto de segurança importante: `checkCompetitor()` usa o cliente service-role (bypassa RLS), então a Server Action **precisa** reverificar, com o cliente RLS-scoped da sessão do usuário logado, que o `competitorId` recebido pertence à `account_id` do admin autenticado *antes* de chamar a função privilegiada — senão um Admin de uma conta poderia disparar checagem em concorrente de outra conta só passando um UUID arbitrário.

### Gotcha de build: `packages/scraper` precisa ser compilado antes do Next.js importar

`apps/web` importa `packages/scraper` via subpath (`scraper/jobs/check-competitor`). O código-fonte usa a convenção `moduleResolution: NodeNext`, onde imports relativos declaram extensão `.js` mesmo apontando para arquivos `.ts` (`from "../core/db.js"`) — é assim que o `tsc` espera que fiquem depois de compilado. Isso funciona direto com `tsx`/`node --import tsx` (usado nos scripts de validação), mas o Turbopack do Next.js **não** faz esse remapeamento de `.js` → `.ts` para pacotes de workspace: tentar importar o `.ts` cru direto (mesmo com `transpilePackages`) falha com `Module not found` nos imports internos do pacote.

**Fix (não é gambiarra, é o uso pretendido do padrão NodeNext)**: `packages/scraper` agora tem seu próprio `tsconfig.json` com `outDir: dist` e um `package.json` com `"exports": { "./*": "./dist/*.js" }` — compila para JS de verdade antes de ser consumido. `apps/web/package.json` tem `predev`/`prebuild` que rodam `npm run build --workspace=scraper` automaticamente antes de `next dev`/`next build`. Confirmado com `npm run build` completo em `apps/web` (compila `scraper` → `dist/`, depois `next build` resolve tudo, rotas `/admin/competitors` etc. geradas sem erro).

## Etapa 6: comparação com cache + `property_changes`

`jobs/persist-and-compare.ts` (`persistAndDetectChanges`) — chamado por `check-competitor.ts` logo depois de uma captura bem-sucedida (mesmo parcial). Persiste o resultado em `properties` e compara com o que já estava salvo. Duas dimensões de mudança, cada uma pode gerar sua própria linha em `property_changes`:

1. **Preço/`price_status` mudou** num imóvel já conhecido (`external_id` já existia) — `old_price`/`new_price` preenchidos, `old_status`/`new_status = null`.
2. **Disponibilidade mudou** — imóvel sumiu da listagem (`ativo` → `possivelmente_vendido`) ou reapareceu (`possivelmente_vendido` → `ativo`) — `old_status`/`new_status` preenchidos, `old_price`/`new_price` = preço atual (sem mudança nesse evento).

**Decisão de escopo**: imóvel novo (`external_id` nunca visto antes) só é inserido em `properties` — **não** gera `property_changes`. O schema permitiria (`old_price` é nullable), mas "comparação com cache" pressupõe uma entrada anterior pra comparar; sem isso não há mudança, só uma captura nova. Revisável se o produto precisar notificar sobre concorrente adicionando imóvel novo.

**Contrato de `stopped_early_due_to_error` (definido antes da Etapa 5, cumprido aqui)**: a inferência "sumiu da listagem = `possivelmente_vendido`" só roda quando `stoppedEarlyDueToError = false` na execução atual. Numa captura parcial, os imóveis que **foram** capturados continuam sendo comparados/atualizados normalmente (preço, `last_seen_at`) — só a inferência por *ausência* fica bloqueada, porque não dá pra saber se os imóveis faltantes sumiram de verdade ou só não foram alcançados por causa do erro de rede.

**Validado**:
- `scripts/test-etapa6-persist-and-compare.ts`: 5 passos determinísticos contra um concorrente sintético isolado (chamando `persistAndDetectChanges` diretamente, sem depender de scraping real) — captura inicial (0 mudanças), mudança de preço (1), imóvel some com execução completa (1, vira `possivelmente_vendido`), imóvel continua ausente mas execução **parcial** (0 — confirma que o gate `stoppedEarlyDueToError` bloqueia a inferência), imóvel reaparece (1, volta a `ativo`). Todos os 5 passos bateram com o esperado.
- Primeira captura real contra `mullerimoveis.com.br` (conta demo): 61/61 imóveis inseridos em `properties`, `changesDetected: 0` (esperado — tudo novo, nada para comparar ainda).

Não coberto ainda por este trabalho: notificação (sino/e-mail) quando `property_changes` é gerado — isso é Etapa 8/9. `persistAndDetectChanges` só grava o dado; nada consome `property_changes` além do contador `changes_detected` em `scraper_runs`.

## Etapa 7: self-healing / recalibração automática

Dois componentes: o **gatilho** (dentro de `check-competitor.ts`, roda em toda checagem) e a **recalibração** (`jobs/recalibrate-site-config.ts` + `jobs/run-recalibrations.ts`, roda separada, sob demanda ou agendada).

### Gatilho de degradação (`check-competitor.ts`)

Depois de uma captura **completa** (`stoppedEarlyDueToError = false` — isso já exclui falha de rede, que é problema do circuit breaker, não deste gatilho), se `propertiesCaptured === 0` ou `cardsWithoutPrice / propertiesCaptured >= 0.5` (`DEGRADED_MIN_MISSING_PRICE_RATIO`), o `site_config` usado nessa execução é marcado `status = 'degradado'` e uma notificação é criada. Sinal de seletor obsoleto (site mudou o HTML), não de falha em alcançar o site.

**Interação que precisou de cuidado**: se o gatilho disparar por `propertiesCaptured === 0`, isso pareceria pra `persistAndDetectChanges` (Etapa 6) que *todos* os imóveis já salvos sumiram do site — inferência errada (é o seletor que quebrou, não o catálogo que esvaziou). Por isso `configLooksDegraded` também entra no gate que bloqueia a inferência por ausência em `persistAndDetectChanges`, exatamente como `stoppedEarlyDueToError` já fazia — `check-competitor.ts` passa `stoppedEarlyDueToError: stoppedEarlyDueToError || configLooksDegraded` pra ele, mas grava o `stopped_early_due_to_error` **original** (sem o OR) em `scraper_runs`, porque essa coluna tem um significado mais estrito já documentado (falha de rede/servidor especificamente).

### Recalibração (`jobs/recalibrate-site-config.ts`)

`recalibrateSiteConfig(competitorId)`: busca o `site_config` de maior `version` (qualquer status, é o "previous" pra comparação), reaprende do zero via IA (`learnSiteConfig`, Etapa 3 — chamada de IA real, não reaproveita nada do config antigo), e decide:

- **`checkExternalIdCompatibility({ previous, next })` compatível E `externalIdSanityOk`** → insere novo `site_config` com `version + 1`, `status = 'ativo'`. Concorrente volta a ser checado normalmente na próxima varredura.
- **Incompatível ou reprovado na sanidade** → insere com `status = 'pendente_revisao'`. **Não** mexe no config anterior (que já estava `'degradado'`, vindo do gatilho) — resultado: nenhum `site_config` com `status = 'ativo'` sobra pra esse concorrente até um SuperAdmin revisar (Etapa 12, ainda não existe). `checkCompetitor` trata isso como "nenhum site_config ativo" e simplesmente não checa esse concorrente até a aprovação — comportamento intencional, não um bug: preferimos parar de checar a arriscar quebrar a continuidade de `property_changes` com uma extração estruturalmente diferente sem revisão humana.

Cada tentativa grava uma linha em `scraper_runs` com `run_type = 'recalibracao'` e insere uma notificação (texto diferente pra ativação automática vs. pendência de revisão).

**Nuance de design registrada, não é bug**: quando a recalibração ativa a nova versão, a versão anterior **não** tem seu `status` alterado — se ela já estava `'degradado'` (fluxo normal, veio do gatilho), não há ambiguidade. Mas nos testes deste trabalho, ao seedar uma "previous" artificialmente com `status = 'ativo'` direto (pulando o gatilho) e a recalibração ativar com sucesso, ficam **duas** linhas com `status = 'ativo'` pro mesmo concorrente (versões diferentes). Não é um problema funcional: `check-competitor.ts` sempre busca `.eq('status','ativo').order('version', desc).limit(1)`, então a versão mais alta sempre vence, não importa quantas versões antigas também estejam marcadas `'ativo'`. Registrado porque pode confundir quem olhar a tabela direto no Table Editor.

**Não coberto por este trabalho**: nenhuma UI dispara `recalibrateSiteConfig`/`runRecalibrations` ainda — são funções chamáveis, não há cron nem botão. Isso é orquestração (equivalente ao scheduler da Etapa 5, mas pra recalibração) — natural next step, mas não foi pedido agora. A aprovação de `pendente_revisao` pelo SuperAdmin é Etapa 12.

### Incidente: migration 0003 nunca tinha sido aplicada (2026-07-10)

Ao testar o ramo `pendente_revisao` pela primeira vez, o `INSERT` falhou com `site_configs_status_check` violado — a constraint viva no Supabase ainda era a original (`'ativo', 'degradado', 'aprendendo'`), sem `'pendente_revisao'`. A migration 0003 (criada na Etapa 3, pensando à frente pra esse exato momento) nunca tinha sido de fato executada no banco, apesar de estar documentada como aplicada. Confirmado com um `INSERT` de sonda direto antes de mexer em qualquer outra coisa. Resolvido rodando a migration faltante — sem impacto de dados (é só troca de constraint, nenhuma linha existente violava a nova regra). Numeração dos arquivos (`0001`-`0004`) continua correta e não precisou de ajuste — o atraso foi só na aplicação, e as duas migrations envolvidas (`0003` e `0004`) mexem em tabelas/colunas disjuntas, então a ordem de aplicação não teve efeito no schema final.

### Não-determinismo da IA no tipo de atributo do `external_id` — investigado, não é risco de segurança

Durante a validação, chamadas consecutivas de `learnSiteConfig` contra o **mesmo site** (`mullerimoveis.com.br`) retornaram `external_id.attribute` como `"text"`, depois `"href"`, depois `"data"` em execuções diferentes — não só a seleção do seletor CSS varia (já documentado na Etapa 3), o **tipo de atributo escolhido** também varia. Isso faz `checkExternalIdCompatibility` rejeitar recalibrações que na prática seriam seguras, com mais frequência do que o ideal (prefere `pendente_revisao` a arriscar — comportamento correto, mas custa revisão manual extra).

**Investigado com dados reais (2026-07-10), não só teoria**: rodou `learnSiteConfig` 5 vezes seguidas contra o mesmo site e inspecionou o **valor efetivamente extraído** em cada rodada (`scripts/investigate-external-id-variation.ts`), não só o tipo declarado:

| Rodada | attribute | valor extraído | contém preço/texto instável? |
|---|---|---|---|
| 1 | `href` | `/imovel/2631469/casa-venda-guaratuba-pr-prainha` | Não — path de URL com o ID do imóvel |
| 2, 3, 5 | `data` (`data-imovelid`) | `2631469` | Não — ID numérico puro |
| 4 | `text` (`.imovelcard__info__ref strong`) | `0028` | Não — código de referência curto |

Conclusão: a variação é **estrutural, não um risco de segurança escapando às vezes**. `href` e `data-attribute` (4 das 5 rodadas) são imunes por construção ao bug original — leem um canal do DOM (atributo HTML, path de URL) onde o preço formatado nunca aparece, diferente do texto visível renderizado. `text` (1 das 5 rodadas) é a única categoria onde o bug pode ocorrer, e é exatamente onde `checkExternalIdSanity` aplica escrutínio (a checagem de sobreposição ancestral) — nessa rodada extraiu um código de referência estável e foi corretamente aprovado. Não é "a proteção falha às vezes"; é a IA escolhendo entre três mecanismos de extração diferentes, dois inertemente seguros e o terceiro coberto pela sanity check.

**Limitação de escopo conhecida, não bloqueio**: `checkExternalIdSanity` defende especificamente contra "`external_id` acidentalmente = preço" — não contra instabilidade de conteúdo por qualquer *outro* motivo (ex: um selo "Novo!" ou contador que muda, texto truncado de forma inconsistente). Não foi observado esse padrão em nenhum dos 7+ sites reais testados neste projeto até agora. Decisão: sem mitigação adicional agora — se aparecer na prática com um cliente real, trata-se naquele momento com um caso concreto em mãos, não por especulação.

**Validado**:
- `scripts/test-etapa7-recalibration.ts`: gatilho de degradação via `checkCompetitor` (seletor quebrado de propósito, extração completa, 0 imóveis) — `configMarkedDegraded: true`, `site_configs.status = 'degradado'`, notificação correta; recalibração com "previous" incompatível — `activated: false`, `status = 'pendente_revisao'`, nenhum `site_config` `'ativo'` restante.
- `scripts/test-etapa7-auto-activate.ts`: recalibração com "previous" == resultado real de uma chamada de IA anterior — `activated: true` na 1ª tentativa, nova versão `'ativo'`, prova empírica do ramo de auto-ativação com IA real (não só lido no código).

## Etapa 8: notificações internas (sino)

`core/notify.ts` (`createNotification`) — ponto único de criação de notificação, criado nesta etapa. Antes, `check-competitor.ts` (pausa por circuit breaker, degradação de config) e `recalibrate-site-config.ts` (resultado da recalibração) inseriam direto em `notifications`, sem checar preferência da conta — refatorados para passar por aqui, então o comportamento fica consistente em todo lugar que notifica, não só nos casos novos desta etapa.

`createNotification` checa `notification_settings.site_enabled` da conta antes de inserir — se `false`, não grava nada e `siteCreated` volta `false` no retorno (sem lançar erro; suprimir é o comportamento esperado, não uma falha). Default `true` se a conta ainda não tiver linha em `notification_settings` (não deveria acontecer em uso normal, mas defensivo). Desde a Etapa 9, o retorno é um objeto (`{ siteCreated, emailSent, emailError }`), não mais um `boolean` — precisou crescer pra reportar o canal de e-mail também.

**Notificação por mudança de preço/disponibilidade** (`check-competitor.ts`, `notifyPropertyChanges`): depois que `persistAndDetectChanges` (Etapa 6) grava um `property_changes`, uma notificação é criada pra cada linha, com `property_change_id` preenchido — permite no futuro (Etapa 11) linkar a notificação de volta pro imóvel específico. Três textos diferentes conforme o tipo de mudança (preço, sumiu, reapareceu); preço formatado em `R$` (`toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })`), não o número cru.

**Decisão de design**: `persistAndDetectChanges` insere cada `property_changes` **individualmente** (não em lote) — o retorno de um `INSERT` em lote via PostgREST não garante preservar a ordem do array enviado, e isso seria necessário pra casar cada linha inserida com o `external_id` certo pra notificação (não dá pra confiar em "índice N do insert = índice N do array enviado" sem essa garantia documentada). Volume por checagem é pequeno (poucas mudanças por vez), então trocar 1 insert em lote por N inserts pequenos é uma escolha de correção, não uma otimização prematura descartada.

### UI: sino no header do dashboard

`apps/web/app/(dashboard)/notification-bell.tsx` (Server Component, busca via cliente RLS-scoped) + `notification-bell-client.tsx` (Client Component, dropdown com contador de não lidas, lista das 10 mais recentes, clique marca como lida, botão "marcar todas como lidas"). Ações em `apps/web/lib/notifications/actions.ts` — não usa `requireRole`/reverificação manual de posse como `checkCompetitorNowAction` (Etapa 5) faz, porque aqui a mutação já roda com o cliente RLS-scoped da sessão do usuário (não service-role) e a policy `account_members_update_own` já restringe o `UPDATE` a `account_id = current_account_id()` no próprio banco — reverificar na Server Action seria redundante, a garantia já existe numa camada mais forte.

Sino só aparece para quem tem `account_id` (Admin e Usuario) — SuperAdmin não tem conta própria, escondido por enquanto (painel de notificações cross-conta, se fizer sentido, é escopo da Etapa 12).

## Etapa 9: e-mail via Resend

Escopo combinado com o usuário antes de começar: integração **completa e funcional no código**, mas `notification_settings.email_enabled` continua `false` (default da coluna) pra todas as contas — sem criar conta no Resend, sem testar envio real. Validado de outra forma (ver "Validado" abaixo): provando que o código realmente chama a API do Resend, sem precisar de uma conta de verdade.

**Onde exatamente a chamada acontece**: `packages/scraper/core/send-email.ts` (`sendEmail`) é o **único** lugar do código que chama `resend.emails.send()`. Ninguém mais importa o SDK do Resend diretamente. `sendEmail` só é chamado de um lugar: `core/notify.ts` (`createNotification`), dentro do bloco `if (emailEnabled)`.

**Comportamento quando `email_enabled = false`** (estado real de toda conta hoje): o bloco `if (emailEnabled)` inteiro em `createNotification` é pulado — `sendEmail()` nem é referenciado em tempo de execução, nenhuma chamada de rede acontece, `RESEND_API_KEY` nunca é lido. Confirmado empiricamente, não só por leitura do `if`: chamei `createNotification` com o estado real da conta demo (`email_enabled: false`) e o retorno foi `{ emailSent: false, emailError: null }` — `emailError` **null**, não uma mensagem de erro, prova que o bloco não foi nem tentado (se tivesse tentado e falhado, `emailError` teria um texto).

`site_enabled` e `email_enabled` são checados de forma **independente** um do outro — o schema já modela os dois como colunas separadas em `notification_settings` (mais `whatsapp_enabled`, ainda sem uso), então uma conta poderia hipoteticamente ter e-mail ligado e sino desligado. Não há dependência entre os dois canais.

**Quem recebe o e-mail** (`core/get-account-recipients.ts`): todos os membros da conta (Admin e Usuario), a mesma audiência do sino — `profiles` não guarda e-mail (só existe em `auth.users`, gerenciado pelo Supabase Auth), então resolve e-mail por membro via API admin (`supabase.auth.admin.getUserById`).

**Resiliência**: falha no envio de e-mail (API fora do ar, chave inválida, etc.) é capturada e reportada em `emailError` — **não** lança exceção nem derruba o resto do fluxo. A notificação do sino (se `site_enabled`) já foi gravada antes; uma checagem inteira (`check-competitor.ts`) não pode travar porque o canal secundário falhou.

**O que falta para ativar de verdade**:
1. Criar conta no [resend.com](https://resend.com) (não feito — decisão do usuário, fora do escopo desta etapa).
2. Verificar um domínio de envio no Resend (ou usar o endereço de sandbox deles pra teste inicial, com limitações de para-quem-pode-enviar).
3. Preencher `RESEND_API_KEY` e `RESEND_FROM_EMAIL` em `apps/web/.env.local` — os dois já existem como placeholders vazios desde a Etapa 1 (`RESEND_API_KEY=`, `RESEND_FROM_EMAIL=`), só faltam os valores reais.
4. Ativar `notification_settings.email_enabled = true` para as contas que devem receber e-mail (hoje `false` em todas, inclusive a demo — deliberado, não mexido nesta etapa).
Nenhuma mudança de código é necessária pra ativar — é só configuração + a flag por conta.

**Validado** (`scripts/test-etapa9-email.ts`), sem enviar e-mail real:
- `email_enabled = false` (estado real): bloco de e-mail não executa (`emailError: null`), notificação do sino grava normalmente.
- `email_enabled = true` mas sem `RESEND_API_KEY`/`RESEND_FROM_EMAIL` configurados (o outro estado real possível hoje): bloqueado por um erro de configuração claro, sem derrubar a notificação do sino.
- `email_enabled = true` com uma chave **falsa** (só pra provar a integração, não uma conta real): a chamada chega de fato aos servidores do Resend e volta com `"API key is invalid"` — prova que o código passa do guard de configuração e faz uma chamada de rede real pra API certa, não é um stub. `email_enabled` restaurado para `false` ao final do teste.

**Corrigido de passagem**: `apps/web/lib/supabase/types.ts` (`Database`) estava desatualizado desde as migrations 0003/0004 — faltava `'pendente_revisao'` em `SiteConfigStatus` e a coluna `stopped_early_due_to_error` em `scraper_runs`. Corrigido nesta etapa por estar mexendo no mesmo arquivo; não causava bug nesta etapa especificamente, mas ficaria latente pra quando a Etapa 10/12 usar esses campos do lado do `apps/web`.

**Validado** (`scripts/test-etapa8-notifications.ts`): `site_enabled = false` suprime (nenhuma linha gravada, `createNotification` retorna `false`); `site_enabled = true` grava normalmente; mudança de preço real no Muller Imóveis (editado `current_price` pra um valor errado de propósito, rodou `checkCompetitor`) gerou notificação com `property_change_id` preenchido e mensagem correta: *"O imóvel 0028 de 'Muller Imóveis' mudou de R$ 1,00 para R$ 15.000.000,00."*

**Não validado por mim** (sem acesso a navegador): a renderização visual do sino/dropdown em `/admin` — `npm run build` compila sem erro, mas a interação real (abrir dropdown, marcar como lida, contador atualizando) precisa ser conferida no navegador.

## Etapa 11: tela de Usuario (somente leitura)

Escopo confirmado com o usuário: Usuario vê **Painel, Histórico, Relatórios, Notificações** — as mesmas informações do Admin — mas nenhum controle de gestão (cadastrar/pausar/retomar concorrente, editar intervalo, confirmar/descartar `site_config`, configurações de notificação). Concorrentes e Configurações continuam admin-only, sem versão somente-leitura — são só gestão, não faz sentido uma versão "read-only" delas.

**Decisão de rotas: `/user/*` espelhadas, não `/admin/*` com `if` de role condicional.** Avaliado antes de implementar: `requireRole` já é a barreira de acesso por página nos dois casos, então a diferença real entre as duas opções não é "quanto código escrever" (é praticamente o mesmo), é onde a barreira mora. Rotas espelhadas preservam `/admin/*` como invariante auditável ("esse prefixo sempre exige Admin", sem precisar abrir cada página pra confirmar) — o custo é só arquivos de rota finos, não duplicação de lógica: cada `page.tsx` em `/user/*` chama `requireRole("usuario")` e delega pro **mesmo** componente de conteúdo que a rota `/admin/*` correspondente usa.

**Padrão aplicado nas 4 áreas** — extraído um componente `*-content.tsx` por área (fica em `admin/`, importado tanto pelo `admin/.../page.tsx` quanto pelo `user/.../page.tsx`), sem duplicar nenhuma query nem UI:
- `admin/dashboard-content.tsx` → `DashboardContent({ accountId, fullName, canManage })`. `canManage=false` só muda o CTA do estado vazio (`empty-state.tsx`): sem link pra `/admin/competitors` (Usuario não acessa aquela rota), mostra "peça a um Admin da sua conta" em vez de botão de cadastro. O resto do dashboard (KPIs, feed, gráficos) já era 100% leitura, nenhuma outra mudança.
- `admin/history/history-content.tsx` → `HistoryContent({ accountId })`. Tela inteira já era leitura, zero diferença entre roles.
- `admin/relatorios/relatorios-content.tsx` → `RelatoriosContent({ accountId, searchParams, basePath })`. Precisou de um parâmetro novo (`basePath`) porque `report-filters.tsx` navega internamente (submeter/limpar filtros) — sem isso, o formulário sempre voltaria pra `/admin/relatorios` mesmo rodando em `/user/relatorios`.
- `admin/notifications/notifications-content.tsx` → `NotificationsContent({ accountId })`. Já suportava os dois roles numa rota só desde a Etapa 8 (`requireRole(["admin","usuario"])`) — separado em duas rotas agora só por consistência de URL (Usuario nunca vê uma URL `/admin/*`), não por necessidade de RLS/permissão (marcar como lida já era seguro pros dois roles, é a própria conta lendo suas próprias notificações).

Sidebar (`sidebar.tsx`): `buildNavItems` computa o prefixo (`/admin` ou `/user`) a partir do role pros 3 itens compartilhados (Notificações/Histórico/Relatórios); Concorrentes/Configurações continuam com `roles: ["admin"]` e href fixo.

**Validado**: `npm run build` limpo, as 4 rotas `/user/*` geradas. Generalizei `scripts/create-admin.mjs` pra aceitar `role` como argumento (`admin` default, ou `usuario`) — o usuário vai criar um usuário de teste com `role: usuario` pelo mesmo processo já usado pro Admin e validar visualmente no navegador (não tenho essa ferramenta nesta sessão).

### Bug de escala encontrado no teste (não era da Etapa 11): `.in("property_id", ...)` quebra com concorrente grande

Ao testar, a conta demo já tinha ganhado um concorrente `json_api` real com **1000 properties** (Sentineli & Sobral, cadastrado via o fluxo de IA da Etapa 10). `get-dashboard-data.ts` e `get-report-data.ts` filtravam `property_changes` com `.in("property_id", propertyIds)` — com 1000 UUIDs, a URL da requisição fica gigante e o Supabase rejeita com `400 Bad Request` **antes** de processar (erro sem detalhe: `{"message":"Bad Request"}`, característico de rejeição em camada de gateway/tamanho de URL, não um erro do PostgREST em si). Reproduzido diretamente contra o banco real antes de mexer em qualquer código, não assumido.

Dois fixes, cada um adequado ao que a query realmente precisa:
- **`get-dashboard-data.ts`**: o filtro `.in("property_id", ...)` era **redundante** — a policy RLS `account_members_select` em `property_changes` já escopa por conta via `property_id → properties → competitors → account_id` no próprio banco (ver migration 0001). Removido o filtro de aplicação; a query fica só com `.gte("detected_at", ...)`, RLS cuida do resto.
- **`get-report-data.ts`**: não dava pra só remover — os filtros de status/busca/concorrente selecionado recortam um subconjunto de imóveis que a RLS (escopada só por conta) não conhece. Invertida a estratégia: busca `property_changes` filtrado só por colunas simples (data, tipo — RLS cobre a conta), e faz a interseção com o conjunto de imóveis já filtrado em **JS**, via `Set` (nunca mais uma lista de IDs na URL). Como consequência, a paginação também deixou de usar `.range()`+`count` do Postgres e virou sempre `.slice()` em JS — simplifica o código (não precisa mais do branch `needsJsFiltering` separado) e continua seguro na escala esperada (linhas de `property_changes` por conta ficam na casa de centenas mesmo quando um concorrente tem milhares de `properties` — são coisas diferentes: uma é quantidade de imóveis, outra é quantidade de eventos de mudança).

**Validado**: as duas queries reproduzidas de novo direto contra a conta real (1000 properties) depois do fix — as duas sem erro, resultado idêntico ao esperado (3 mudanças reais, mesmo número de antes do bug aparecer).

### Bug de escala encontrado em produção: `duplicate key` em `properties` a partir de ~1000 imóveis

Reportado pelo usuário: clicar em "Verificar agora" na Sentineli & Sobral (que já tinha crescido para 1408 properties) passou a falhar com `duplicate key value violates unique constraint "properties_competitor_id_external_id_key"`, depois de uma edição manual de preço no banco. Não acontecia com o Muller Imóveis (61 properties) em execuções repetidas.

**Investigado antes de corrigir, com dados reais** (pedido explícito do usuário — não assumir a causa):
1. `scraper_runs` da Sentineli & Sobral tinha só 1 execução registrada, `success: true`, `stopped_early_due_to_error: false` — descartada a hipótese de execução parcial anterior deixando dado inconsistente.
2. Nenhum `external_id` duplicado já existia em `properties` para esse concorrente — descartada corrupção de dado pré-existente.
3. Reproduzida a query exata que `persistAndDetectChanges` usa para carregar "quais properties já existem" (`.select(...).eq("competitor_id", competitorId)`, sem `.range()`): devolveu **1000 de 1408** linhas reais, sem nenhum erro — o PostgREST/Supabase corta silenciosamente respostas não paginadas em ~1000 linhas. Essa é a causa raiz: ~408 imóveis reais ficavam de fora do mapa "isso já existe?", eram tratados como novos na checagem seguinte, e o `insert()` batia na constraint única contra a linha que já existia de verdade. Muller nunca cruzava esse limite (61 < 1000), por isso nunca reproduziu.
4. O usuário sugeriu upsert como correção. Confirmado que upsert **sozinho não bastaria**: teria evitado o crash, mas continuaria roteando incorretamente imóveis além da linha 1000 para o branch de "novo" em vez de "já existe → comparar preço" — ou seja, mudanças de preço em parte do catálogo continuariam silenciosamente não detectadas. A correção da causa raiz é paginar a busca (`.range()` em loop até uma página devolver menos que o tamanho da página); upsert foi mantido como rede de segurança adicional, não substituto.

**Mesmo padrão também achado, proativamente, em mais dois lugares** (mesma causa raiz, sintoma diferente — não crash, e sim contagem silenciosamente incompleta): `get-dashboard-data.ts` (busca de `properties` pro feed/breakdown) e `get-report-data.ts` (busca de `properties` pra Relatórios, complicada por filtros condicionais de `status`/`search` — resolvida reconstruindo a query com os mesmos filtros a cada página, já que um query builder do supabase-js só pode ser resolvido uma vez). Os três reproduziam a mesma truncagem em 1000/1408 linhas antes do fix.

**Validado contra dados reais** (Sentineli & Sobral, `scripts` já removidos após o uso): editado `current_price` de uma property no offset 1200 (fora da antiga janela de 1000) direto no banco, rodado `checkCompetitor` de verdade contra o site real. Resultado: sem erro (`success: true`), sem duplicata (`external_ids` únicos confirmados via paginação completa depois), e a mudança foi corretamente registrada em `property_changes` (`old_price` = valor injetado, `new_price` = valor real recapturado do site) — prova que a comparação "já existe, teve preço alterado" agora cobre corretamente imóveis além da antiga linha 1000, não só que o crash sumiu.
