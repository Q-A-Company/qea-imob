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

### ⚠️ Pré-requisito obrigatório antes da Etapa 7: falso positivo em `checkExternalIdSanity`

**Não é "nice to have" — é bloqueante.** Descoberto em 2026-07-09 ao semear `mullerimoveis.com.br` como concorrente de demonstração (fora de um teste automatizado, em uso real): `checkExternalIdSanity` rebaixou `confidence_score` para `0.2` mesmo com um `site_config` correto.

Causa: a checagem em `ai/site-config-compatibility.ts` (linha ~27) rejeita sempre que `external_id.attribute === "text" && price.attribute === "text"` — **mesmo quando os seletores CSS são completamente diferentes**. No caso real:

```
external_id: { selector: ".imovelcard__info__ref strong", attribute: "text" }  // "Ref: XXXX", estável
price:       { selector: ".imovelcard__valor__valor", attribute: "text" }       // preço, seletor distinto
```

Isso é o mesmo padrão de `external_id` já validado com 61/61 (100%) na Etapa 4 — não é o bug real que a checagem foi desenhada para pegar (`external_id` acidentalmente igual ao `price`, ou capturando título/preço junto). A heurística testa "os dois campos usam texto livre?" quando deveria testar "os dois campos vêm do **mesmo** seletor (ou se sobrepõem)?" — `attribute === "text"` sozinho não indica sobreposição, é o jeito normal de extrair tanto referência quanto preço na maioria dos sites.

**Por que isso bloqueia a Etapa 7, não é só um incômodo cosmético**: a Etapa 7 (self-healing) vai usar exatamente esse sinal para decidir se recalibra via IA automaticamente. Um falso positivo faz `confidence_score` cair para `0.2` num `site_config` perfeitamente funcional — se a Etapa 7 usar esse `confidence_score` (ou o próprio `sanityOk: false`) como gatilho de recalibração, ela vai disparar chamadas de IA desnecessárias em produção para configs que não têm nada de errado. Custo real, recorrente, silencioso.

**Antes de implementar a Etapa 7**: revisar `checkExternalIdSanity` em `ai/site-config-compatibility.ts` para detectar sobreposição real (mesmo seletor, ou um seletor sendo ancestral/descendente do outro no DOM, ou o valor extraído de fato conter o preço) em vez do proxy grosseiro atual (`attribute === "text"` nos dois). Atualizar `scripts/test-sanity-unit.ts` com este caso real (`mullerimoveis`) como regressão — hoje ele só cobre o caso de sobreposição verdadeira (`cutrimimobiliaria`), não o de falso positivo.

## Requisito para as Etapas 5/6/7 (scheduler, comparação, self-healing — ainda não implementadas): `stoppedEarlyDueToError`

`run-price-check.ts` (Etapa 4) retorna `stoppedEarlyDueToError: boolean` — true quando a extração parou por falha de rede/servidor (após esgotar retries), não por chegar ao fim legítimo da paginação. `scraper_runs.stopped_early_due_to_error` (migration `0004`) existe especificamente pra carregar esse sinal até o banco. Contrato obrigatório para quem implementar as próximas etapas:

1. **Etapa 6 (comparação com cache / `property_changes`)**: quando a execução tiver `stopped_early_due_to_error = true`, **não** inferir que imóveis ausentes nessa checagem foram removidos/vendidos — a lógica de "sumiu da listagem → `possivelmente_vendido`" só vale para execuções completas. Imóveis que **foram** capturados nessa mesma execução (mesmo parcial) continuam sendo comparados/atualizados normalmente — só a inferência por *ausência* é que fica bloqueada.
2. **Etapa 5 (scheduler)**: `stopped_early_due_to_error = true` conta como falha para um circuit breaker de falhas de rede consecutivas por concorrente (pausar + notificar SuperAdmin depois de N seguidas). **Implementado** — ver seção "Etapa 5" abaixo (`N = 3`).
3. **Etapa 7 (self-healing)**: `stopped_early_due_to_error` **não** deve, sozinho, disparar recalibração via IA. O gatilho de recalibração (`site_configs.status = 'degradado'`) é especificamente para quando a extração respondeu por completo mas capturou 0 imóveis ou a maioria sem preço — isso indica seletor obsoleto. Uma falha de rede não diz nada sobre se os seletores ainda estão corretos; recalibrar nesse caso desperdiçaria uma chamada de IA sem corrigir nada.
4. **`scraper_runs`**: toda chamada de `run-price-check.ts` deve gravar uma linha em `scraper_runs` com `stopped_early_due_to_error` fiel ao que o job retornou — não é opcional, é o registro de auditoria que Etapas 5/6/7 e o painel SuperAdmin (Etapa 12) dependem para funcionar corretamente.

## Requisito para a Etapa 10 (telas de admin — ainda não implementado)

A prévia de extração mostrada ao Admin antes de ativar um concorrente precisa exibir explicitamente **"X de Y imóveis capturados (Z%)"** — não só a lista de itens da amostra. `Y` vem de `total_listings_hint` (estratégia `html_css`) ou do campo de total confirmado (estratégia `json_api`); quando `Y` for desconhecido, mostrar isso como tal ("total desconhecido"), não omitir.

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
