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

## Investigação real: lopes.com.br (Angular Universal, TransferState)

Cadastro de teste capturou só 23 de 523 imóveis declarados (~4%) — `html_css` sem paginação detectável (`pagination.type: "none"`), e a detecção automática de `json_api` (`ai/json-api-detector.ts`) não achou nada. Investigando: `lps-search-product-card` é um Web Component Angular; o HTML estático só continha os 23 cards renderizados no servidor (SSR), o resto depende de scroll/JS no navegador real. A varredura de `<script src>` só achou 2 scripts (`polyfills`, `main`) — o bundle principal (~82KB) não continha nenhuma pista de endpoint porque a lógica de busca vive num **chunk carregado sob demanda pelo router Angular**, nunca referenciado no HTML inicial — estruturalmente invisível pro scan de scripts, por mais candidatos que ele rastreie.

**Achado**: Angular Universal (SSR) embute as respostas HTTP feitas durante a renderização no servidor num `<script id="ng-state" type="application/json">` (`TransferState`) — cada entrada guarda a URL real chamada (`u`) e o corpo da resposta (`b`). Parseando esse blob, achei a URL real sem precisar executar JavaScript: `https://apis.lopes.com.br/portal-home/v2/search/cache/sale/br/rj/rio-de-janeiro/barra-da-tijuca?page={page}` — pública, sem autenticação, `products.content` com os itens, `products.totalElements` batendo exato com o `total_listings_hint` (523) já extraído do texto da página.

**Corrigido em `ai/json-api-detector.ts`** (generaliza pra qualquer site Angular Universal parecido, não só o Lopes):
- Nova `findTransferStateUrls()` lê o `ng-state` e alimenta os mesmos candidatos que a varredura de `<script src>` já produzia — TransferState primeiro (URLs reais confirmadas por uma chamada de verdade, não suposição de regex sobre bundle minificado).
- `findItemsArray()` ficou recursiva (até 2 níveis, pra achar `products.content` em vez de só arrays no nível raiz) **e** passou a escolher o maior array entre candidatos, não o primeiro — sem isso, batia num array pequeno de widgets de SEO ("bairros relacionados", 4 itens) antes de achar a listagem de verdade (23-24 itens/página).
- Descoberta empírica de `starting_page` (0 ou 1-indexed, comparando contra a resposta "default" sem parâmetro) — antes sempre assumia `1`; a API do Lopes é 0-indexed, então isso teria pulado a página inteira de índice 0.

Validado contra o HTML real salvo do Lopes (script descartável, deletado depois): detector achou o endpoint/campos certos, extração completa capturou 523 de 523 imóveis (vs. 23 antes).

**Gap novo revelado pela validação**: a API "cache" do Lopes não pagina de forma estável — 120 `external_id` repetidos ao longo de 22-23 páginas (só 403 realmente únicos, apesar de `totalElements: 523`). `json-api-extractor.ts` não tinha proteção contra isso (só `html-paginator.ts` tinha `seenIds`/`duplicateExternalIds` — o comentário original desta interface dizia que nenhuma API `json_api` validada até então repetia itens entre páginas). Confirmado empiricamente que isso quebrava de verdade: o upsert de `persist-and-compare.ts` falha com `ON CONFLICT DO UPDATE command cannot affect row a second time` quando o mesmo `external_id` aparece duas vezes no mesmo lote. **Corrigido**: `extractFromJsonApi` agora dedupe com o mesmo padrão de `html-paginator.ts` (`seenIds`/`duplicateExternalIds`), e para a paginação quando uma página inteira só traz itens já vistos (mesmo que `total_field` diga que ainda falta gente) — sem isso, um `total_field` errado/instável faria a extração paginar até `MAX_PAGES` de propósito nenhum. Revalidado: 403 imóveis únicos, upsert real funcionando sem erro.

## Limitação conhecida: WordPress `admin-ajax.php` + nonce

O detector automático de `json_api` (`ai/json-api-detector.ts`) varre `<script src>` em busca de padrões de endpoint (`api`, `search`, `busca`, `ajax`, etc.) e testa candidatos via **GET**. Isso funciona bem para APIs REST-ish com nome descritivo (ex: `/api/anuncios/search`).

**Não cobre** o padrão mais comum em sites WordPress com JetEngine/Elementor (Loop Grid, Listing Grid): a paginação/scroll infinito chama `/wp-admin/admin-ajax.php` via **POST**, com um `action` específico do plugin e um `_wpnonce` (token de segurança de curta duração, gerado por carregamento de página) no corpo da requisição. Sem o nonce correto, a requisição é rejeitada — e o nonce não pode ser obtido só analisando arquivos `.js` estáticos, precisa ser extraído do HTML/estado da página no momento do carregamento.

Confirmado esse padrão em `cewimoveis.com.br` (JetEngine, `orderby: modified`) durante a validação da Etapa 3 — o detector automático retornou `not_found` porque não há um endpoint GET com nome descritivo, só o dispatcher genérico protegido por nonce.

**Confirmado empiricamente (2026-07-09), não só teorizado**: capturado via DevTools o payload real (`POST /imoveis/?nocache=... action=jet_engine_ajax`, com `query[signature]` de 64 hex chars). Replay exato da signature capturada, na sequência, já falhou (`{"success":false,"data":"Invalid query signature"}`) — inclusive reusando a mesma signature pra uma página diferente. Não é fixa, não é reutilizável, expira rápido. Confirma que não vale a pena investir mais tempo tentando reproduzir esse hash sem uma sessão de browser ao vivo por checagem (o que na prática significa Playwright, não HTTP puro).

**Decisão (2026-07-09)**: não vamos construir suporte a POST+nonce agora — é escopo maior (extrair nonce do HTML/estado inicial, montar o corpo POST no formato específico de cada plugin, lidar com expiração do nonce em checagens periódicas) e foge do "resolver quando aparecer em escala" combinado para a Etapa 3. Para sites nesse padrão, hoje a cobertura fica limitada ao que `html_css` consegue ver na primeira renderização estática (útil quando a ordenação padrão é por recência, como confirmado em `cewimoveis`) — `cewimoveis` fica definitivamente como cobertura parcial (30/810, ~3,7%) até um dia justificar o investimento em Playwright.

## Limitação conhecida: integração quebrada do lado do concorrente (`deboraimoveis.com.br`)

`deboraimoveis.com.br` está com `site_configs` versão 1 (`html_css`, `confidence_score: 0.05`) em `status: "degradado"` — o container `#container-resultado-busca` fica vazio no HTML estático, os cards são carregados via AJAX depois do carregamento da página (ou por scroll). O concorrente tem **zero** `properties`/`property_changes` registrados (nenhum histórico real acumulado, cadastro nunca chegou a capturar nada).

**Endpoint real descoberto via DevTools (manualmente, em sessão anterior)**: `POST https://www.deboraimoveis.com.br/retornar-imoveis-disponiveis`, form-urlencoded, parâmetros documentados no próprio JS deles (`assets/js/objImovel.js`, objeto `imovel` com comentários linha a linha, inclusive marcação explícita de quais campos são "OBRIGATÓRIO"). Ordenação padrão é `valordesc` (por preço, decrescente) — **não** por recência, então não existe atalho de "páginas quentes"; qualquer checagem teria que varrer o catálogo inteiro, igual ao caso `Sentineli`.

**Sessão via `PHPSESSID` — testado e funciona**: um GET simples em `/venda` retorna `PHPSESSID` reaproveitável via header `Set-Cookie`, sem precisar de sessão de browser real "aquecida". Confirmado empiricamente (2026-07-11) reutilizando esse cookie com sucesso em 4 endpoints irmãos do mesmo backend: `retornar-tipos-disponiveis`, `retornar-cidades-disponiveis`, `retornar-bairros-disponiveis`, `retornar-parametros-gerais` — todos retornaram dados reais e corretos (cidades reais do Paraná, tipos de imóvel, bairros) usando só `fetch` puro, nenhum Playwright/browser necessário.

**O endpoint de listagem em si está quebrado do lado deles**: `retornar-imoveis-disponiveis` retorna consistentemente

```json
{"error":true,"log":"Curl failed with error #22: The requested URL returned error: 500 Internal Server Error","message":"Ocorreu um erro inesperado. Redirecionando...","redirect":"/manutencao"}
```

Esse erro é o próprio fallback padrão da aplicação deles (`$.ajaxSetup({ complete: ... })` em `assets/js/utils.js`, comentado no código-fonte como "CONFIGURAÇÃO PADRÃO AJAX PARA CASO A API NÃO CONSIGA CONECTAR") — ou seja, é a aplicação deles sinalizando que a chamada interna dela (via cURL) ao backend de busca (aparentemente Imoview, a julgar pelos comentários no JS e pelo domínio `s3.imoview.com.br` nas imagens de demonstração) falhou ao conectar.

**Descartado como problema de payload, não só teorizado**: testadas múltiplas variações antes de concluir — payload completo replicando exatamente os defaults documentados em `objImovel.js` (todos os ~40 campos), payload mínimo (só os 4 campos marcados "OBRIGATÓRIO"), `finalidade` como string (`'venda'`, valor default real do JS deles) e como numérico (`2`/`1`, valor sugerido pelo comentário deles, que diverge do próprio default), com e sem headers de AJAX (`X-Requested-With`, `Referer`, `Origin`), e até **corpo completamente vazio** — todas retornam o exato mesmo erro. Como os 4 endpoints irmãos no mesmo backend/sessão funcionam normalmente, a variável de payload está descartada: a falha é isolada ao endpoint de listagem especificamente, do lado deles.

**Decisão (2026-07-11)**: não ativar nada — mantido em `degradado`/pendente de revisão, sem recalibração. Não é uma limitação técnica nossa (diferente do caso CEW acima, que é uma limitação de escopo do produto); é um bug real na integração deles, fora do nosso controle. Se um dia quisermos retomar, a descoberta já está pronta (endpoint, payload, mecanismo de sessão via `PHPSESSID` puro) — só seria preciso reconfirmar se a integração deles com a Imoview voltou a funcionar antes de construir o `site_config` `json_api` de verdade.

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

## robots.txt: checagem automática e contínua (não só no cadastro)

`core/robots.ts` (`assertAllowedByRobots`/`isAllowedByRobots`) — checagem de `Disallow` (`User-agent: *`) contra o `pathname` da URL, sem cache entre chamadas (o robots.txt pode mudar entre um cadastro e uma recalibração posterior; cada chamada relevante reconfere). Já existia dentro de `fetch-html.ts` (`fetchListingHtml`) desde antes, cobrindo o HTML da listagem — mas só ali. Corrigido em 2026-07-13 (achado ao investigar se o cadastro de concorrente bloqueava caminhos proibidos: não bloqueava, e o caminho `json_api` de rotina não conferia nada) para cobrir os outros dois pontos que faziam requisição de dado real sem checar:

1. **`json-api-extractor.ts`** (`extractFromJsonApi`): confere UMA vez, contra a URL da 1ª página, antes do loop de paginação — não a cada página (o template do endpoint só varia o valor de paginação, então `origin+pathname` é idêntico em todas; reconferir por página seria trabalho repetido). Lança `RobotsDisallowedError`, mesmo tratamento que já existia no lado `html_css`.
2. **`ai/json-api-detector.ts`** (`probeCandidate`): confere cada candidato de endpoint ANTES de testá-lo durante o aprendizado — um candidato bloqueado é descartado (`return null`, mesmo tratamento de qualquer outro candidato que não bate), nunca chega a fazer uma requisição de dado real pra ele.

**Cadastro de concorrente novo** (`registerCompetitorAction`, `apps/web/lib/competitors/actions.ts`): antes desta correção, uma `RobotsDisallowedError` durante `learnSiteConfig` caía no mesmo catch genérico de "aprendizado falhou" — o concorrente ficava cadastrado (`status: 'ativo'`) sem config nenhuma, com uma mensagem que sugeria "tente recalibrar depois", como se fosse uma falha técnica passageira. Agora tratado à parte: desfaz o cadastro (`DELETE` do concorrente, já que nada mais foi persistido além dele) e devolve um erro específico explicando que o robots.txt proíbe aquele caminho — não oferece "recalibrar", já que bateria no mesmo bloqueio.

**Recalibração** (`recalibrate-site-config.ts`/`run-recalibrations.ts`): já era segura por construção antes mesmo desta correção — `learnSiteConfig` lançando (robots.txt ou qualquer outro motivo) impede que qualquer linha nova de `site_configs` seja gravada, então o config `'ativo'` anterior nunca é substituído por uma recalibração que nem chegou a rodar. A mensagem de erro (`err.message`, já clara desde sempre por causa do `RobotsDisallowedError.message`) só não chega a nenhuma tela hoje porque, como já documentado acima (Etapa 7), nenhuma UI dispara `runRecalibrations()` ainda — é uma lacuna de orquestração preexistente, não desta correção.

**Testado** contra 5 casos reais (`isAllowedByRobots` chamado direto): listagem e endpoint `json_api` de rotina da Sentineli & Sobral (permitido), listagem da Muller Imoveis RJ (permitido) e seu `/wp-json/` (**bloqueado** — confirma que o parser reconhece uma restrição real, não só em teoria), listagem da Cutrim (permitido) — bate exatamente com o que o usuário já tinha conferido manualmente. E contra um robots.txt restritivo simulado (servidor HTTP local descartável, `Disallow: /admin/` e `/api/privado/`): caminho permitido passa, os dois bloqueados são rejeitados. `assertAllowedByRobots` confirmado lançando `RobotsDisallowedError` de verdade (não só o booleano) nos dois sentidos.

## Etapa 5: scheduler + fila + botão "Verificar agora"

Escopo desta etapa é só "preparar o terreno" (decisão explícita, 2026-07-09): roda `run-price-check.ts` (Etapa 4) de forma agendada/manual, grava `scraper_runs` corretamente e implementa o circuit breaker de falhas de rede. **Não** faz nenhuma inferência de "imóvel sumiu = vendido" nem gera `property_changes` — isso é Etapa 6, ainda não existe. `changes_detected` fica sempre `0` por enquanto.

- **`jobs/scheduler.ts`** (`getDueCompetitors`): lê todos os concorrentes com `status = 'ativo'` e filtra em memória os que já passaram do próprio `polling_interval_minutes` desde `last_checked_at` (ou nunca foram checados). Sem fila persistente (Redis/BullMQ) — decisão consciente para o estágio atual do produto; ver `run-due-checks.ts`.
- **`jobs/check-competitor.ts`** (`checkCompetitor(competitorId)`): orquestra uma checagem completa para 1 concorrente — busca o `site_config` ativo mais recente, chama `runPriceCheck`, decide o circuit breaker, grava `scraper_runs`, atualiza `last_checked_at`. É a função que tanto o scheduler automático quanto o botão manual "Verificar agora" chamam — mesmo caminho de código nos dois casos, sem lógica duplicada.
  - **Circuit breaker de falhas de rede** (`CONSECUTIVE_FAILURE_THRESHOLD = 3`): conta `scraper_runs.stopped_early_due_to_error` mais recentes em ordem decrescente de `created_at`, parando no primeiro `false`. Na 3ª falha consecutiva, o concorrente vira `status = 'pausado'` e uma notificação é inserida em `notifications` para a conta. **Separado** do gatilho de recalibração via IA (Etapa 7, que ainda não existe) — falha de rede não diz nada sobre seletores obsoletos.
  - **Falha total** (exceção lançada por `runPriceCheck`, ex: DNS/timeout antes de capturar qualquer página) conta como `stoppedEarlyDueToError = true` pelo mesmo motivo que falha parcial conta: não dá pra saber se os imóveis ausentes sumiram de verdade ou só não foram alcançados.
  - **Reativação automática**: se um concorrente `pausado` (pelo circuit breaker) for checado manualmente via "Verificar agora" e a checagem for bem-sucedida sem `stoppedEarlyDueToError`, o `status` volta pra `ativo` sozinho. Só reativa nesse caso específico — nunca sobrescreve uma pausa manual feita por outro motivo.
  - **Falhas intermitentes isoladas NÃO disparam o circuit breaker — comportamento conhecido e aceitável, não é bug** (incidente real investigado em 2026-07-12/13, worker rodando a noite inteira): o Cutrim teve 7 falhas de rede (HTTP 522 do Cloudflare, timeout de 20s) em 109 execuções numa janela de ~12,5h (~6%) — todas isoladas, nunca 2 seguidas, cada uma se recuperando sozinha na checagem seguinte (5-13min depois). Como o circuit breaker conta falhas *consecutivas* (`N=3`), e aqui o máximo real foi 1, ele corretamente nunca pausou o concorrente. Decisão confirmada com o usuário: **não** adicionar uma proteção nova de "taxa de falha numa janela deslizante" — 6% intermitente sem nenhuma mudança perdida (o gate de `stopped_early_due_to_error` já impede inferência de "removido" nessas execuções) não justifica mais complexidade agora. Revisitar só se a taxa de falha subir muito ou passar a gerar 3+ consecutivas de verdade.
  - **Gap de diagnóstico corrigido em 2026-07-13**: até então, uma falha no caminho `json_api` (`json-api-extractor.ts`, `fetchJsonWithRetry` esgotando os retries no meio da paginação) marcava `stopped_early_due_to_error = true` mas gravava `scraper_runs.error_message` **vazio** — o status HTTP/motivo real da falha era descartado dentro da função, nunca propagava. Diferente do caminho `html_css`, onde uma falha na 1ª página sempre teve a mensagem real (exceção lançada por `fetch-html.ts`, capturada em `checkCompetitor`). Isso impediu diagnosticar de verdade por que a Sentineli & Sobral parava consistentemente ~página 60 de ~118 (ver investigação de 2026-07-12/13) — sem o status HTTP, não dá pra distinguir 429 (rate limit) de 500 (erro do servidor deles) de timeout puro. Corrigido: `fetchJsonWithRetry` agora devolve `{ body, errorReason }`, propagado via `JsonApiExtractionResult.stoppedEarlyErrorReason` → `RunPriceCheckResult.stoppedEarlyErrorReason` → `scraper_runs.error_message`, mesmo padrão de detalhe que o `html_css` já tinha. **Gap equivalente em `html-paginator.ts` (`fetchHtmlWithRetry`, página 2+) corrigido também, mesmo dia**: não foi exercido no incidente do Cutrim (esse concorrente não tem paginação real, `pagination.type: "none"`), mas existia e foi replicado com o mesmo padrão — `fetchHtmlWithRetry` agora devolve `{ html, notFound, errorReason }`, propagado via `PaginatedExtractionResult.stoppedEarlyErrorReason` → `RunPriceCheckResult.stoppedEarlyErrorReason` → `scraper_runs.error_message`.
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

## Etapa 12: painel de gestão de clientes pelo SuperAdmin

Escopo confirmado com o usuário antes de implementar: `/superadmin` (listagem de contas, busca por nome, filtro ativo/inativo) e `/superadmin/accounts/[id]` (detalhe de uma conta — dados gerais, usuários, concorrentes somente leitura, execuções recentes do scraper, notas internas). Billing, subdomínio por cliente e impersonation ficaram explicitamente fora desta rodada (pedido do usuário).

**Três decisões levantadas antes de codar** (lendo os tipos reais de `@supabase/auth-js` em `node_modules`, não por suposição), confirmadas pelo usuário:
- **Histórico de login**: `getUserById`/`listUsers` só expõem `last_sign_in_at` (o último, não uma lista). Um histórico completo exigiria tabela própria + algo capturando cada evento (webhook/trigger) — fora do escopo desta rodada, fica como item separado se o usuário pedir.
- **Ativar/desativar usuário**: `ban_duration` nativo da Admin API (`updateUserById(uid, { ban_duration: '876000h' })`, `'none'` reativa) — o próprio GoTrue impede login, sem duplicar estado em `profiles`. `banned_until` já vem em `getUserById`.
- **Redefinir senha**: os dois mecanismos, por pedido do usuário — `updateUserById(uid, { password })` gera e exibe uma senha temporária (funciona hoje, sem depender de e-mail); `generateLink({ type: 'recovery', email })` gera um link, mas o Supabase **não envia e-mail sozinho** ("to be sent via a custom email provider") — o SuperAdmin copia e entrega manualmente enquanto `email_enabled`/Resend não estiverem ativos de verdade (Etapa 9).

**Migration `0006`**: só `accounts.internal_notes` (texto livre, só SuperAdmin lê/escreve). `report_generations` (histórico de "quando um relatório foi gerado") **não** entrou nesta migration — foi implementado por engano numa primeira rodada (uma resposta de `AskUserQuestion` voltou `"Incluir nesta rodada"` divergindo do que o usuário registrou como `"Deixar pra depois"`, causa não identificada) e removido a pedido do usuário antes de aplicar. A decisão de produto pendente (o que conta como "gerar um relatório": clique em Imprimir/Exportar vs. simplesmente abrir a tela com filtros aplicados) continua em aberto.

**Server Actions** (`superadmin/accounts/[id]/actions.ts`) sempre reconfirmam que o usuário-alvo pertence à conta (`assertUserBelongsToAccount`) antes de qualquer mutação — a Admin API do Supabase Auth não sabe nada de `account_id`, então um `accountId` adulterado no client não pode ser usado para atingir usuário de outra conta. Exclusão de usuário usa `<dialog>` nativo com confirmação por texto digitado (`EXCLUIR`), não só um segundo clique — destrutivo e sem undo fácil.

**Validado com dados reais** (conta demo, dona da Sentineli & Sobral — `scripts` já removidos após o uso): criado um usuário de teste (`createUser` + trigger criou o `profile` certo); login confirmado com a senha inicial; reset de senha temporária trocado e confirmado por login real (senha antiga passou a falhar, nova funcionou); `generateLink` retornou um `action_link` válido; `ban_duration` bloqueou login de verdade (erro `"User is banned"`) e reativar destravou de novo; mudança de cargo persistida; nota interna salva, lida de volta e limpa; query de `scraper_runs` trouxe as 15 execuções reais da Sentineli & Sobral (incluindo a checagem com 1409 imóveis); usuário de teste excluído, com o `profile` removido em cascata.

**Não validado por mim** (sem acesso a navegador): a interação visual completa — abrir o modal de exclusão, o formulário de cadastro de usuário, os toggles de cargo/ban na tela. `npm run build` compila sem erro, mas a navegação real precisa ser conferida no navegador.

### Etapa 12.1: shell escopado por conta (reestruturação da visão de detalhe)

A visão de detalhe pedida originalmente (uma página só, achatada, listando tudo em sequência) foi reestruturada a pedido do usuário: entrar numa conta cliente agora é "assumir a visão daquele cliente" — mesma sidebar hover-expand + header do Admin/Usuario, só que com itens escopados à conta (Painel, Relatórios, Concorrentes, Usuários, Configurações, Relatório de erros), mais um banner fixo "Visualizando: X · Voltar para Clientes" pra nunca confundir com a navegação global do SuperAdmin.

**Antes de implementar, o usuário pediu uma avaliação de esforço** (o padrão `canManage`/`basePath` da Etapa 11 já parametriza `accountId`, `RelatoriosContent`/`DashboardContent` recebem a conta como prop, não derivam da sessão — extensão quase grátis). A peça genuinamente nova, identificada antes de codar: trocar a sidebar sem empilhar duas navegações visíveis. Layouts do Next.js sempre aninham pela posição real no sistema de arquivos — não existe "sair" de um layout ancestral só porque a rota é um descendente. Solução: `app/superadmin/accounts/[id]/*` vive **fora** de `app/(dashboard)/`, num subtree completamente novo. Como grupos de rotas entre parênteses não afetam a URL, a rota continua sendo `/superadmin/accounts/[id]/*`, mas a cadeia de layout é independente — `layout.tsx` desse subtree não herda a sidebar global do SuperAdmin, monta a própria (`account-sidebar.tsx`, itens por `accountId` em vez de por role) + reaproveita `Header` (componente puro, sem mudança nenhuma) + o banner.

**`get-account-detail-data.ts` (monolítico) foi quebrado em fetchers focados por página**, um por rota (`get-account-banner.ts` para o layout — só `id/name/active`, roda em toda navegação; `get-account-users.ts`; `get-account-competitors.ts`; `get-account-settings-data.ts` — dados gerais + contagens + `notification_settings`; `get-account-error-runs.ts`) — cada página busca só o que precisa, em vez de uma função gigante devolvendo tudo pra qualquer rota que a chamasse.

**`notification_settings` fica somente leitura** por decisão explícita: `/admin/settings` (o lugar "certo" pra essa edição, do ponto de vista do próprio Admin da conta) ainda é um placeholder desde a Etapa 10 — construir a edição primeiro do lado do SuperAdmin criaria uma implementação de referência por acidente, que teria que ser revista quando a Etapa de Configurações do Admin for pedida de verdade.

**`get-account-error-runs.ts` já nasce com paginação real** (`.range()` + `{count:'exact'}`, filtro `.or("success.eq.false,stopped_early_due_to_error.eq.true")`) — não `.limit()` sem paginação nem `.slice()` em JS, aplicando direto a lição do bug de truncagem em ~1000 linhas investigado nesta mesma sessão (ver seção acima). `scraper_runs` cresce sem limite (uma linha por checagem), diferente de `property_changes` (que fica na casa de centenas por conta).

**Bug real encontrado e corrigido durante essa reestruturação**: `user-management-table.tsx` ainda importava de `./get-account-detail-data` (arquivo já apagado numa etapa anterior desta reestruturação) — um import morto que só quebraria no build/typecheck do consumidor certo. Corrigido antes de escrever a página de Usuários que o importa.

**Validado com dados reais** (conta demo — `scripts` já removidos após o uso): query de concorrentes confirmada (2 concorrentes reais); contagens de `getAccountSettingsData` conferidas (2 concorrentes, 2 usuários) e o `notification_settings` real da conta lido corretamente (`site_enabled: true, email_enabled: false, whatsapp_enabled: false`); paginação de `scraper_runs` (erros) executada sem erro, com o filtro confirmado linha a linha (só trouxe execuções realmente marcadas como falha ou parada antecipada). A conta demo só tem 1 execução com erro hoje, então a checagem de "página 1 e página 2 não se sobrepõem" não pôde ser exercida com uma segunda página real — o mecanismo de paginação em si (`.range()`) já é o mesmo já validado nos três fixes de truncagem anteriores desta sessão, não uma implementação nova.

**Não validado por mim** (sem acesso a navegador): clique real nas 6 rotas do shell (destaque do item ativo na sidebar, comportamento do banner, `notFound()` num id inexistente). `npm run build` gera as 6 rotas sem erro, mas a navegação de verdade precisa ser conferida no navegador.

### Bug de segurança real: `accounts.active` nunca teve enforcement

Reportado pelo usuário: desativar uma conta pelo SuperAdmin não impedia os usuários dela de continuarem usando o sistema — o campo só era salvo/exibido, nada verificava. Confirmado antes de mexer em qualquer código: nem `proxy.ts` (só checa se existe sessão via `getUser()`, autorização por role é delegada de propósito pra DAL), nem `lib/auth/dal.ts` (`getProfile`/`requireRole` nunca liam `accounts.active`), nem `lib/auth/actions.ts` (`login` só validava credencial + existência de profile).

**Descoberta que mudou a abordagem**: a policy RLS `self_select` em `profiles` (`id = auth.uid()`) não depende de `current_account_id()` — então só ajustar RLS não bastaria, `getProfile()` continuaria lendo o profile de uma conta desativada normalmente. Precisa dos dois:
1. **App-level** (`lib/auth/dal.ts`, `getProfile`): depois de achar o profile, se `account_id` não for nulo, busca `accounts.active` e retorna `null` (como se não houvesse sessão) se estiver desativada. Como este app não tem nenhum client-side Supabase direto (conferido: zero import do browser client em todo `apps/web`) e todo Server Component/Server Action roda `getProfile()` do zero a cada request, isso bloqueia já no próximo clique/navegação — não precisa esperar o token expirar.
2. **App-level** (`lib/auth/actions.ts`, `login`): mesmo check logo após `signInWithPassword`, com mensagem clara e `signOut()` explícito — sem isso, o login teria sucesso e só `getProfile()` bloquearia depois, prendendo o usuário num loop de redirect confuso.
3. **RLS** (migration `0007`, `current_account_id()`): a função passou a fazer `join` com `accounts` e só retornar o `account_id` quando `active = true`. Como praticamente toda policy do projeto filtra por `account_id = current_account_id()`, isso propaga o bloqueio pra todas as tabelas de uma vez (rede de segurança pra qualquer chamada direta ao Supabase que não passe pela DAL, não o mecanismo principal).

**Decisão sobre invalidação de sessão** (avaliada e confirmada com o usuário antes de implementar): não foi adicionado banimento em cascata dos membros da conta no momento da desativação. Como o bloqueio já acontece no próximo request (não há sessão client-side de longa duração fazendo query direta), o ganho de uma invalidação ativa seria de segundos, não da janela de expiração do token (~1h) — não compensa a complexidade extra de rastrear "banido por causa da conta desativada" vs. "banido individualmente" (necessário pra não reativar errado depois).

**Item relacionado (mensagem de erro de login)**: usuário banido individualmente (`ban_duration`) e conta desativada mostravam o mesmo erro genérico "e-mail ou senha inválidos", confuso já que a credencial está correta. Investigado com dados reais antes de decidir: `user_banned` é um `ErrorCode` distinto de `invalid_credentials` na API do Supabase Auth (confirmado em `node_modules/@supabase/auth-js`) — mas o Supabase revela `user_banned` **mesmo com a senha errada** (testado: senha certa banido → `user_banned`; senha errada banido → `user_banned` também; senha errada em e-mail inexistente → `invalid_credentials`). Ou seja, isso funciona como um oráculo de enumeração (dá pra descobrir que uma conta existe e está banida sem saber a senha). Explicado o trade-off pro usuário antes de implementar — aceito conscientemente dado o porte do produto (B2B, poucas contas). `login()` agora mostra "Seu acesso foi desativado..." pra usuário banido individualmente e "A conta da sua empresa está desativada..." pra conta inativa — mensagens diferentes de propósito, porque só a segunda aponta pro suporte (a primeira, uma vez que a Etapa de gestão de usuários do Admin existir, seria resolvida pelo próprio Admin da conta).

**Validado com dados reais** (conta demo, dona da Sentineli & Sobral e Muller Imóveis — `scripts` já removidos após o uso): confirmado que o Supabase Auth sozinho não sabe nada de `accounts.active` (`signInWithPassword` sucede normalmente mesmo com a conta desativada) — prova de que o bloqueio tem que ser da aplicação, não algo que a Auth resolve sozinha. A réplica exata do check que `login()`/`getProfile()` fazem bloqueou corretamente com a conta inativa e liberou de novo depois de reativar. (Nota: a conta demo já estava com `active: false` no banco real no início deste teste — provavelmente o próprio usuário tinha desativado manualmente pra confirmar o bug antes de pedir a correção; o script já reativou ao final, sem deixar resíduo.)

**Pendente de aplicar**: migration `0007_enforce_account_active.sql` ainda precisa ser rodada no Supabase real pelo usuário (mesmo processo manual das anteriores) — as duas checagens app-level (DAL + login) já funcionam sem ela, ela é só a camada extra de RLS.

### Lacuna de escopo: gestão de usuários pelo Admin da própria conta (novo cargo "Gerente")

No desenho original de roles (Etapa 2) ficou definido que o Admin gerenciaria usuários da própria conta — nunca implementado; só o SuperAdmin tinha essa tela (Etapa 12). Pedido do usuário evoluiu durante a conversa: em vez de só "Admin gerencia usuario", virou uma hierarquia de 3 níveis com terminologia de imobiliária — confirmado com o usuário via matriz de permissão antes de codar.

**Rótulos exibidos mudaram, valores técnicos não** (decisão deliberada, menor blast radius): `admin` → "Diretor / T.I", `usuario` → "Corretor", e `gerente` é o único valor de `role` literalmente novo. Rotas (`/admin/*`), `requireRole()`, RLS — tudo continua usando os identificadores técnicos antigos; só o texto exibido ao usuário mudou (`ROLE_LABEL` em `lib/supabase/types.ts`, importado tanto por Server quanto Client Components — ao contrário de `ROLE_HOME`, que fica duplicado de propósito entre `dal.ts`/`sidebar.tsx` pela fronteira server-only/client, um mapa de rótulo não tem esse problema).

**Hierarquia confirmada com o usuário** (2 perguntas de decisão antes de implementar):
- Diretor/T.I (admin) tem as mesmas capacidades de sempre (Concorrentes, Configurações, Relatórios) **e** gerencia qualquer usuário da conta, inclusive outro Diretor/T.I (par) — o usuário preferiu mais flexibilidade de autogestão a restringir gestão entre pares.
- Gerente (novo) tem as mesmas capacidades funcionais de Diretor/T.I, com um teto: só cria/gerencia usuário cargo Corretor — nunca outro Gerente nem Diretor/T.I. Aplicado nas Server Actions (`lib/users/actions.ts`), não só escondido na UI: `assertCanManage()` rejeita a chamada mesmo que alguém tente disparar a Server Action direto, sem passar pelo formulário.
- Regra de segurança operacional confirmada: bloqueado desativar/rebaixar/excluir o **último** Diretor/T.I de uma conta (`wouldRemoveLastAdmin()`, `lib/users/shared.ts`) — evita a conta cliente ficar órfã de autogestão até o SuperAdmin notar. Aplicada tanto nas novas Server Actions do Admin/Gerente quanto retroativamente nas do SuperAdmin (a regra vale independente de quem executa a ação).

**Reuso real do que a Etapa 12 já tinha construído** (não duplicação): `UserManagementTable` e `CreateUserForm` passaram a receber as Server Actions **via prop** (injeção de dependência) em vez de importar direto de `./actions` — é isso que permite o mesmo componente servir o SuperAdmin (gerencia qualquer conta, passa `accountId` explícito por closure) e o Admin/Gerente (gerencia só a própria conta — `lib/users/actions.ts` nunca aceita `accountId` como parâmetro, deriva sempre do profile de quem está logado via `requireRole`, pra um `accountId` adulterado no client não conseguir atingir outra conta). `viewerRole` como prop controla o teto de hierarquia dentro do próprio componente (seletor de cargo, quais linhas aparecem editáveis vs. "fora do seu escopo de gestão").

**Migration `0008`**: `gerente` adicionado à constraint de `role`; as policies `admin_manage`/`admin_manage_account_profiles` (competitors, site_configs, properties, notification_settings, profiles) ampliadas de `current_role() = 'admin'` para `current_role() in ('admin', 'gerente')` — a restrição fina (quem gerencia quem) fica só na aplicação, RLS aqui só garante que gerente consegue escrever na própria conta, igual admin já conseguia.

**Validado com dados reais** (conta demo — `scripts` já removidos após o uso): a proteção do último Diretor/T.I testada nos dois sentidos — com 2+ admins na conta, excluir um não bloqueia; isolando a conta a 1 único admin, a mesma checagem bloqueia corretamente. Estado real restaurado ao final (1 admin real, "Joao", intocado).

**Validado com dados reais depois das migrations 0007 e 0008 aplicadas** (conta demo, dona da Sentineli & Sobral e Muller Imóveis — `scripts` já removidos após o uso):
- Antes de trocar a constraint de `role`, conferido que nenhuma das 3 linhas reais de `profiles` tinha valor fora de `(superadmin, admin, usuario)` — mesmo cuidado de migrations anteriores (ver incidente da 0003 registrado acima).
- **`accounts.active`, pilha completa**: com a conta ativa, login funciona e uma sessão real lê `competitors` normalmente (RLS ok). Desativando a conta: confirmado que o Supabase Auth sozinho ainda deixaria logar (não sabe do nosso campo customizado) — só a checagem da aplicação bloqueia, com a mensagem certa; e a MESMA sessão já autenticada, tentando ler `competitors` de novo, agora vem vazia — prova de que a migration 0007 (`current_account_id()` retornando `NULL` com conta inativa) está de fato ativa no RLS, não só no papel. Reativando, os dois voltam ao normal (login funciona, RLS libera de novo).
- **Hierarquia de cargos**: criado um Gerente de teste (confirma que a constraint da migration 0008 aceita o novo valor) e um Corretor de teste. `assertCanManage` bloqueou corretamente Gerente tentando mexer no Diretor/T.I real da conta (`Joao`) — e confirmado que ele realmente não sofreu nenhum efeito colateral (`banned_until` continuou vazio, já que o guard barra antes de qualquer `updateUserById`). No caminho permitido, Gerente desativou de verdade o Corretor de teste (ban_duration aplicado e confirmado), não só "o guard deixou passar". Diretor gerenciando outro Diretor (par) confirmado como permitido, conforme decisão do usuário. Usuários de teste removidos ao final; o Diretor real (`Joao`) seguiu intocado.

**Não validado por mim** (sem acesso a navegador): a interação visual em `/admin/users` — item de sidebar "Usuários" pra Admin/Gerente, seletor de cargo condicional, linhas "fora do escopo de gestão" pro Gerente. `npm run build` compila a rota sem erro, mas a navegação real precisa ser conferida no navegador.

**Bug real encontrado no teste visual**: `app/superadmin/accounts/[id]/users/page.tsx` passava as Server Actions do SuperAdmin pra `UserManagementTable` envolvidas em arrow functions só pra fechar sobre `accountId` (ex: `(userId, newRole) => changeUserRoleAction(userId, id, newRole)`) — quebrou em runtime: *"Functions cannot be passed directly to Client Components... Or maybe you meant to call this function rather than return it."* Uma closure comum não é uma Server Action, só a própria referência (ou um `.bind()` dela) atravessa a fronteira Server→Client. Corrigido reordenando os 4 parâmetros dessas Server Actions pra `accountId` vir **primeiro** (`changeUserRoleAction`, `toggleUserBanAction`, `deleteUserAction`, `resetUserPasswordAction`) e trocando as closures por `.bind(null, id)` — `bind` só pré-preenche argumentos a partir do início da lista, por isso a ordem importa. As Server Actions do Admin/Gerente (`lib/users/actions.ts`) nunca tiveram esse problema, porque são passadas direto (`changeRole: changeUserRoleActionForAdmin`), sem nenhuma closure por cima — accountId ali é derivado da sessão, não precisa de bind nenhum.

## WhatsApp: standby deliberado (não reintroduzir sem revisitar a decisão)

Decisão do usuário: WhatsApp não vai ser integrado por enquanto — o processo de aprovação como BSP (Business Solution Provider) é caro e lento, e mesmo pela via oficial ainda carrega risco residual. `packages/scraper/notifications/whatsapp.ts` existe só como adapter noop (loga a intenção, não chama nenhuma API de verdade) — isolado de propósito, pra ativar no futuro ser só trocar o corpo dessa função, sem tocar em `core/notify.ts` nem em nenhuma tela. `notification_settings.whatsapp_enabled` continua no schema (nenhuma migration de remoção) mas não aparece em nenhuma tela — removida a linha "WhatsApp" da visão somente-leitura de Configurações do SuperAdmin (`app/superadmin/accounts/[id]/settings/page.tsx`), já que não faz sentido mostrar uma opção que não funciona de verdade.

Nota de precisão: o pedido de reverter pressupunha que esse adapter já existia em algum estado anterior — conferido antes de mexer em qualquer coisa, ele nunca tinha sido criado (só o placeholder `WHATSAPP_PROVIDER=noop` em `.env.local.example`, desde a Etapa 1). O arquivo foi criado agora já no estado de standby descrito, não "revertido".

## Resumo diário por e-mail (substitui o e-mail por mudança individual)

Mudança de escopo do que a Etapa 9 tinha implementado: `email_enabled` deixou de disparar um e-mail por `property_change` individual dentro de `createNotification` (`core/notify.ts`) — agora só alimenta um resumo agregado, 1x por dia, por conta. O sino (`site_enabled`) **não muda nada** — continua instantâneo, por mudança, exatamente como antes (é gratuito, não depende de API externa, não faz sentido resumir).

**`core/notify.ts` simplificado**: removido o bloco inteiro de e-mail (e os campos `emailSent`/`emailError` do retorno, que nenhum dos 3 call sites — `check-competitor.ts`, `recalibrate-site-config.ts` — sequer lia). Função ficou só sobre o sino agora.

**`packages/scraper/jobs/send-daily-digest.ts`** (novo): pra cada conta com `email_enabled=true`, agrega `property_changes` do dia (UTC, mesma simplificação de fuso já usada em `get-dashboard-data.ts` — não é por usuário) por concorrente, e manda **um** e-mail por conta via Resend (nunca um por mudança). Conta sem nenhuma mudança no dia não recebe nada — pedido explícito do usuário, mensagem vazia não agrega valor e ainda geraria custo/ruído à toa. Falha ao enviar pra uma conta (Resend fora do ar, chave inválida) não derruba as outras — cada conta processada dentro do próprio `try/catch`, erro fica registrado no resultado da conta, não propaga.

**Busca sem os dois bugs de escala já corrigidos nesta sessão**: paginação real (`.range()` em loop) em vez de `.select()`/`.limit()` sem paginação (o bug de truncagem em ~1000 linhas), e nunca `.in("property_id", ...)`/`.in("competitor_id", ...)` com uma lista de IDs — busca tudo paginado e cruza em JS (o bug de URL gigante de `get-dashboard-data.ts`). Como este job varre a tabela toda (não é escopado por conta na query, só depois em JS), essas duas lições valiam a pena aplicar desde o primeiro dia, não descobrir de novo mais tarde.

**Texto exato aprovado** (assunto e corpo, gerados de verdade a partir de dados reais — não mockup):

Um concorrente com mudança:
```
Assunto: Resumo diário — 9 de julho de 2026

Hoje, 5 mudanças de preço no concorrente que você monitora:

Sentineli & Sobral: 5 mudanças

Obrigado por usar o Q&A Imob!
```

Vários concorrentes com mudança (ordenados por quantidade, maior primeiro):
```
Assunto: Resumo diário — 9 de julho de 2026

Hoje, 8 mudanças de preço entre os concorrentes que você monitora:

Sentineli & Sobral: 5 mudanças
Muller Imóveis: 3 mudanças

Obrigado por usar o Q&A Imob!
```

**Registro auditável**: tabela nova `email_digest_log` (migration `0009`) — não reaproveita `notifications` (que alimenta o sino) de propósito, pra não misturar uma linha de resumo agregado no meio do dropdown do sino, que é só eventos individuais. `unique(account_id, digest_date)` evita duplicar envio se o job rodar duas vezes no mesmo dia (usa `upsert`).

**Nenhum cron real dispara isso sozinho** — mesma lacuna operacional que já existia pras checagens de preço da Etapa 5 (`getDueCompetitors`/`runDueChecks` também nunca são chamadas por nada automático hoje, conferido: zero referências fora da própria definição). `sendDailyDigest()` é uma função chamável — precisa de algo (cron externo, rota agendada) disparando 1x/dia; isso ainda não existe pra nada neste projeto.

**Validado com dados reais** (`scripts` já removidos após o uso): dia sem nenhuma mudança (10/07) corretamente resultou em `skippedReason: "sem mudanças no dia"`, nenhuma tentativa de envio. Dia com mudanças reais (09/07, gerado pelos próprios testes desta sessão): agregação correta por conta/concorrente (Sentineli & Sobral: 5, Muller Imóveis: 3, total 8), destinatários reais resolvidos (2 membros da conta demo), e a falha esperada por `RESEND_API_KEY`/`RESEND_FROM_EMAIL` não configurados (estado real do ambiente, mesma limitação já documentada na Etapa 9) foi capturada no resultado da conta sem derrubar o job.

**Pendente de aplicar**: migration `0009_email_digest_log.sql` ainda precisa ser rodada pelo usuário — sem ela, o passo de registro (`upsert` em `email_digest_log`) falharia mesmo com Resend configurado; a agregação e o texto já funcionam sem ela (validado acima).

### Link pro relatório do dia + idempotência real

Pedido de acompanhamento: o resumo deveria linkar pro relatório **daquele dia específico**, não pra tela de Relatórios em branco. Antes de implementar, confirmado (lendo `parse-filters.ts`) que `/admin/relatorios` e `/user/relatorios` **já** leem `from`/`to` da URL na carga inicial do Server Component — não precisou de nenhum ajuste na tela de Relatórios, a suspeita do usuário de que isso talvez só funcionasse depois de submeter o formulário manualmente não se confirmou.

**Link é por cargo do destinatário**: `getAccountRecipientEmails` virou `getAccountRecipients` (devolve `{email, role}`, não só e-mail) — Corretor (`usuario`) não tem acesso a `/admin/*`, receberia um link que só o rejeitaria; `send-daily-digest.ts` agrupa os destinatários por `basePath` (`/admin/relatorios` pra Diretor/T.I e Gerente, `/user/relatorios` pra Corretor) e manda até 2 e-mails por conta (não um por pessoa), cada um com o link certo: `{APP_BASE_URL}{basePath}?from={digestDate}&to={digestDate}`. Nova env var `APP_BASE_URL` (documentada em `.env.local.example`) — necessária porque um job de backend não tem acesso à origem de uma request HTTP como um Server Component teria.

**Bug de template corrigido de passagem**: `core/send-email.ts` renderizava a mensagem inteira num `<p>` sem `white-space: pre-line` — as quebras de linha do resumo (uma por concorrente) apareceriam tudo grudado numa linha só no e-mail de verdade. Corrigido (mudança aditiva seguinda, não afeta nenhuma mensagem existente de uma linha só).

**Idempotência real, não só em memória**: `sendDailyDigest()` agora checa `email_digest_log` **antes** de enviar (não só no `upsert` depois) — necessário porque o worker (abaixo) roda num loop contínuo com um guard em memória que não sobrevive a um restart; sem a checagem no banco, um redeploy no mesmo dia do envio reenviaria o e-mail pra todo mundo.

**Texto final aprovado** (com o link, gerado de verdade a partir de dados reais):
```
Assunto: Resumo diário — 9 de julho de 2026

Hoje, 8 mudanças de preço entre os concorrentes que você monitora:

Sentineli & Sobral: 5 mudanças
Muller Imóveis: 3 mudanças

Veja o relatório completo de hoje: https://app.qeaimob.com.br/admin/relatorios?from=2026-07-09&to=2026-07-09

Obrigado por usar o Q&A Imob!
```

## Worker persistente (Railway) — dispara as checagens e o resumo diário de verdade

Achado crítico do usuário que motivou isso: nada disparava `runDueChecks`/`sendDailyDigest` automaticamente — o produto inteiro dependia de clique manual, contradizendo a promessa de "checagem a cada 5 minutos". Avaliadas as opções antes de escolher (pedido explícito do usuário, "não decida sozinho"):

- **Vercel Cron Jobs**: o teto de duração de uma function serverless (Hobby até 60s, Pro configurável até ~300s) é a mesma pra uma rota chamada por cron ou por qualquer outra request. A Sentineli & Sobral sozinha já leva ~4min (~240s) numa varredura completa (~118 páginas) — perto demais do teto do Pro hoje, antes de qualquer crescimento de carteira de clientes. Hobby também só permite cron 1x/dia, inviabilizando "a cada 5 minutos" nesse plano independente do tempo de execução.
- **Cron externo (GitHub Actions, cron-job.org, etc.) chamando uma rota Vercel**: resolve só a restrição de frequência, não o teto de duração — a rota continua sendo a mesma function serverless.
- **Supabase pg_cron/Edge Functions**: pg_cron só roda SQL; Edge Functions rodam em Deno, exigiria reescrever `packages/scraper` de Node pra Deno.
- **Escolhido: worker Node contínuo no Railway** — sem teto de duração por execução, já era o plano original (worker separado do dashboard).

**`apps/worker`** (novo workspace, `apps/*` já é reconhecido pelo `package.json` raiz): processo único, `src/index.ts`, loop com `setTimeout` recursivo (não `setInterval` — uma checagem de minutos não pode deixar o próximo tick começar por cima antes do atual terminar). A cada ciclo (`WORKER_CHECK_INTERVAL_MS`, default 60s): chama `runDueChecks()` (Etapa 5 — `getDueCompetitors` decide quem está devido pelo próprio `polling_interval_minutes`); e, só na hora configurada (`DAILY_DIGEST_HOUR_UTC`, default 23h UTC), uma vez por dia, chama `sendDailyDigest()`.

**Variáveis de ambiente** (`apps/worker/.env.local.example`) — essencialmente as mesmas do `apps/web`, porque roda os mesmos jobs fora do processo do Next.js: `SUPABASE_URL`/`SUPABASE_SECRET_KEY` (service role), `ANTHROPIC_API_KEY` (self-healing), `RESEND_API_KEY`/`RESEND_FROM_EMAIL` (resumo diário), `APP_BASE_URL` (link do relatório), mais `WORKER_CHECK_INTERVAL_MS`/`DAILY_DIGEST_HOUR_UTC` (só do worker, com default sensato). Em produção (Railway), essas variáveis são configuradas direto no painel do serviço — não é lido nenhum arquivo `.env` em produção, só em dev (`npm run dev --workspace=worker`, que usa `--env-file=.env.local`).

**Validado**: `npm install` (novo workspace reconhecido), `npm run build --workspace=worker` (compila `scraper` primeiro, depois o worker) e o típecheck raiz, todos limpos. Rodado de verdade por alguns segundos com credenciais reais — iniciou, logou corretamente, não achou nenhum concorrente devido no momento (não dispara uma varredura completa de graça só de ligar).

**Pendente**: configurar de verdade o serviço no Railway (fora do escopo desta sessão — não tenho acesso a infra de deploy).

### Validado com dados reais depois da migration 0009 aplicada — registro e idempotência

`RESEND_API_KEY`/`RESEND_FROM_EMAIL` continuam não configurados no ambiente real (limitação já conhecida desde a Etapa 9) — então uma tentativa de envio de verdade falha antes de chegar à API do Resend. Isso, na prática, tornou impossível testar "primeira chamada manda um e-mail de verdade, segunda não reenvia" de ponta a ponta sem credenciais reais do Resend. Em vez de simular isso com uma chave falsa (que só provaria de novo a mesma falha de configuração, já documentada), o teste validou o mecanismo de verdade:

1. Primeira chamada, dia real com mudanças (09/07): agregação correta (Sentineli & Sobral: 5, Muller Imóveis: 3, total 8) e a falha esperada de configuração do Resend — **confirmado que esse envio que falhou NÃO gravou nenhuma linha em `email_digest_log`** (não registra como enviado o que não foi enviado de verdade — importante: um `upsert` ingênuo depois do envio, sem essa checagem, teria esse risco).
2. Semeada manualmente uma linha simulando um envio bem-sucedido anterior pra esse mesmo dia/conta.
3. Segunda chamada, mesmo dia: **detectou o log existente e pulou antes de sequer buscar destinatários** (`skippedReason: "resumo deste dia já foi enviado"`, sem nenhum erro de Resend — prova de que não chegou a tentar enviar de novo, não só que falhou de novo).
4. Confirmado que continua existindo exatamente 1 linha de log pra essa conta/dia (sem duplicar).

Estado restaurado ao final (log de teste removido, `email_enabled` de volta a `false`). `scripts` já removidos após o uso.

## Dois níveis extras de controle sobre envio de e-mail (Nível 1 e Nível 2)

Pedido de acompanhamento, três camadas de controle agora, checadas em ordem por `sendDailyDigest()`: (1) interruptor global da plataforma, (2) `notification_settings.email_enabled` por conta (já existia), (3) preferência pessoal por usuário.

**Nível 0** (base pros outros dois, também descoberto faltando nesta rodada): `/admin/settings` era só o placeholder da Etapa 10 desde sempre — nenhum toggle de canal existia. `NotificationChannelToggle` (site/e-mail) construído, editável só por Diretor/T.I e Gerente, com o aviso de `RESEND_API_KEY`/`RESEND_FROM_EMAIL` ausente ao ligar e-mail (salva a intenção mesmo assim — o Admin/Gerente não controla infra, só intenção de negócio).

**Nível 1 — interruptor global** (`system_settings`, migration `0010`): tabela singleton (`id boolean primary key default true check (id = true)` garante exatamente 1 linha) editável só por SuperAdmin, em `/superadmin/system` (novo item de sidebar, fora do shell por conta — é plataforma inteira, não uma conta específica). `sendDailyDigest()` checa isso **antes** de tudo — se desligado, nem consulta contas/mudanças, só retorna `globallyPaused: true`.

**Nível 2 — preferência pessoal** (`profiles.email_notifications_enabled`, migration `0010`): self-service pra qualquer cargo. RLS sozinho só filtra QUAIS linhas (a própria via `id = auth.uid()`) — o `grant update (email_notifications_enabled)` restringe QUAIS colunas, senão a policy sozinha deixaria alterar `role`/`account_id` da própria linha via PATCH direto (risco de escalonamento de privilégio). Componente `PersonalEmailPreferenceToggle` reaproveitado entre `/admin/settings` (Diretor/T.I, Gerente) e um `/user/settings` novo (Corretor) — decisão de manter `/admin/*` como admin/gerente-only (invariante da Etapa 11) em vez de abrir a rota pro Corretor.

**`getAccountRecipients` (core/get-account-recipients.ts) passou a filtrar por `email_notifications_enabled = true`** — quem desligou a própria preferência nunca aparece na lista de destinatários do resumo diário, mesmo com a conta inteira tendo e-mail ligado.

**Validado com dados reais** (conta demo — `scripts` já removidos após o uso):
- **Interruptor global**: desligado, `sendDailyDigest()` num dia com mudanças reais (09/07) retornou `globallyPaused: true` e **zero contas processadas** — nem a conta demo, que tem `email_enabled=true` e 8 mudanças reais naquele dia, foi sequer consultada. Religado, voltou a processar normalmente (mesma agregação de sempre: Sentineli & Sobral 5, Muller Imóveis 3).
- **Preferência individual**: criado um usuário de teste (opt-in por padrão, apareceu nos destinatários reais, contagem foi de 2 pra 3). Desligada a preferência só dele: sumiu da lista, e os outros 2 destinatários reais da conta (`joao@teste.com.br`, `user@teste.com.br`) continuaram exatamente os mesmos — confirma que o opt-out é por pessoa, não contamina o resto da conta.

Estado restaurado ao final em ambos os testes (usuário de teste excluído, interruptores voltaram ao estado original).

## `change_type` explícito em property_changes — "adicionado" e "removido" ganham primeira classe

Pedido de acompanhamento: reportar explicitamente quando um concorrente ganha (`added`) ou perde (`removed`, já existia como inferência) imóveis na listagem — não só mudança de preço em imóveis já conhecidos. Isso exigiu resolver uma limitação de modelagem: até aqui, o "tipo" de uma linha em `property_changes` era **inferido** de quais colunas (`old_status`/`new_status`) estavam nulas — e "adicionado" precisaria do mesmo formato nulo que "preço" já usa, tornando a inferência ambígua sem uma coluna própria.

**Migration `0011`**: `change_type text not null check (... in ('price','added','removed','reappeared'))`, com backfill retroativo — confirmado contra dados reais antes de escrever a migration que só existiam 8 linhas, todas classificáveis sem ambiguidade pela mesma lógica de inferência antiga (nenhuma virou `'other'`/desconhecida).

**A ressalva que não estava no pedido original, mas mudou o desenho**: `check-competitor.ts` já combinava dois sinais diferentes (`stoppedEarlyDueToError`, falha de rede; `configLooksDegraded`, seletores possivelmente quebrados) numa única flag antes de chegar em `persistAndDetectChanges`. "Adicionado" é baseado em **presença** (o imóvel foi realmente observado, com aquele preço) — ao contrário de "removido", que é baseado em **ausência** (inferência: "não vi", que pode só significar "não alcancei"). Por isso "adicionado" ignora `stoppedEarlyDueToError` (falha de rede não torna o que FOI capturado menos confiável) mas continua bloqueado por `configLooksDegraded` (um seletor quebrado pode extrair `external_id` lixo, que nunca bateria com nada existente e pareceria "novo" sem ser um imóvel de verdade) — as duas flags agora viajam separadas até `persist-and-compare.ts`, decisão confirmada com o usuário antes de implementar.

**Detalhe de correção no upsert de properties novas**: o upsert em lote de imóveis novos (defesa contra a paginação, ver bug de truncagem documentado acima) agora usa `.select("id, external_id, created_at")` pra saber o `id` real de cada linha inserida — e compara `created_at` com o `now()` da própria execução (tolerância de 60s) antes de gerar um evento `'added'`. Isso cobre o caso raro em que o upsert bate num conflito real (a linha já existia, apesar do mapa em memória não ter achado): `created_at` antigo = não é uma inserção genuína, não vira `'added'` — mesmo raciocínio de correção que já levou à paginação explícita, aplicado de novo aqui.

**Reflexos na interface** — todos os pontos que antes inferiam tipo por `old_status`/`new_status` nulos passaram a usar `change_type` direto:
- `notifyPropertyChanges` (sino): novo branch pra `'added'` — "Novo imóvel: {concorrente}" com código e preço.
- "Verificar agora" (`check-now-button.tsx`): quebra "X imóveis capturados · Y mudança(s) de preço · Z adicionado(s) · W removido(s)" (só os tipos com contagem > 0 aparecem).
- Feed do dashboard (`changes-feed.tsx`): branch novo pra `'added'` — sem isso, um evento "adicionado" (que tem `old_status`/`new_status` nulos, igual preço) teria renderizado errado, tipo "R$ — → R$ X".
- Relatórios: filtro 3-way (Preço | Adicionado | Disponibilidade — decisão confirmada com o usuário, Disponibilidade continua agrupando removido+reaparecido, a tabela distingue os dois visualmente sem precisar de filtro separado). `direction`/`minVariation` continuam exclusivos de "Preço" (adicionado não tem `old_price` pra comparar, igual disponibilidade já não tinha).
- Resumo diário por e-mail: cada linha por concorrente agora detalha "N mudanças de preço, N adicionados, N removidos" (só os tipos presentes), não só um total genérico.

**`scripts/test-etapa6-persist-and-compare.ts` atualizado** (não é um script descartável — é a validação determinística permanente de `persist-and-compare.ts`, existia desde a Etapa 6): 7 passos agora, cobrindo os 4 `change_type` e a nova separação `stoppedEarlyDueToError`/`configLooksDegraded`. Rodado depois da migration aplicada — todos os 7 passos (12 asserções) passaram. Um erro no PRÓPRIO script foi encontrado e corrigido no caminho: o Passo 6 (config degradado bloqueando "adicionado") persiste a property mesmo com o evento bloqueado — dado bruto capturado continua salvo, só o evento de notificação é que fica mais conservador — então o Passo 7 original reusava o mesmo `external_id` e testava a coisa errada (a property já não era mais "nova" na segunda chamada). Corrigido usando um `external_id` diferente no Passo 7.

**Validado contra o site real** (Muller Imóveis — `scripts` já removidos após o uso): deletada uma property real (`0028`) da tabela pra forçar o scraper a recapturá-la como se fosse nova, e inserida uma property fake que não existe no site de verdade. Rodado `checkCompetitor` contra o site real: detectou corretamente 1 `added` (preço real recapturado, R$ 15.000.000,00) e 1 `removed` (a fake). Notificação "Novo imóvel: Muller Imóveis" gerada com o código e preço corretos na mensagem. `property_changes` gravado com `old_price=null`/`new_price` preenchido pro evento `added`, exatamente como desenhado.

**Texto do resumo diário corrigido durante a validação**: a primeira versão usava `"N adicionado(s)"` — soava estranho no singular ("1 adicionado(s)"). Trocado por pluralização de verdade (`1 adicionado` / `2 adicionados`), mesmo padrão já usado pro resto do texto. Mesmo ajuste aplicado no texto do "Verificar agora".

## Regressão real: prévia do cadastro capturando só a 1ª página sem avisar (mullerimoveisrj.com.br)

Reportado pelo usuário: `mullerimoveisrj.com.br` tinha sido validado numa sessão anterior com 1.077 de 1.077 imóveis (100%, `html_css`, paginação numerada). Recadastrado pelo fluxo normal, a prévia mostrou só **8 imóveis capturados** — mesmo a página exibindo "última página: 135" (ou seja, o site tem ~1080 imóveis de verdade). Pedido explícito: não confirmar o cadastro até a causa ficar clara, e investigar se o mesmo problema estava mascarado como "100%" em outros 5 concorrentes cadastrados na mesma sessão.

**Causa raiz — duas lacunas que se combinam**:

1. `learn-site-config.ts` (`learnSiteConfig`, chamada pela prévia do cadastro) só busca **a página 1** pra estratégia `html_css` — `extractAllPagesFromHtml` (a função que percorre TODAS as páginas de verdade, `html-paginator.ts`) só é chamada depois, em `checkCompetitor` (checagem manual ou pelo scheduler), nunca durante o cadastro. Isso não é um bug em si — walkar 135 páginas durante um fluxo de UI interativo levaria minutos (confirmado empiricamente: 359,7s pra esse site específico), inviável pra uma prévia ao vivo.

2. A rede de segurança que deveria pegar esse caso (`coverageLooksLow` em `learn-site-config.ts`, que tenta detectar um endpoint JSON quando a cobertura parece baixa) só dispara quando existe um `total_listings_hint` numérico pra comparar. O prompt da IA (`config-generator.ts`) só instruía a procurar uma menção **explícita** de total ("1.409 imóveis") — não instruía a estimar a partir do número da **última página** de uma paginação numerada. `mullerimoveisrj.com.br` não tem menção explícita, só a paginação (`última página: 135`) — a IA via e reportava isso no warning, mas não convertia num `total_listings_hint`, então a rede de segurança nunca disparava e a amostra de 8 imóveis passava como se fosse suficiente, com `confidence_score: 0.9`.

**Confirmação de que o `site_config` em si estava correto** (não era falha de paginação/timeout): rodei `extractAllPagesFromHtml` (a mesma função de um check de verdade) direto contra o site ao vivo, usando o `site_config` já salvo — **135 páginas percorridas, 1075 imóveis encontrados, 0 duplicatas, parada natural (`fetch_failed` só na última página)**. Bate quase exatamente com os 1.077 validados antes.

**Os outros 5 concorrentes cadastrados na mesma sessão — verificados individualmente, não só confiando no `confidence_score`**:
- **Podium Imoveis, Paula Costa, OnBrokers** (`json_api`): rodei `extractFromJsonApi` de novo contra a API real de cada um — 704/191/653 imóveis respectivamente, várias dezenas de páginas cada, sem erro. `json_api` pagina de verdade DURANTE a prévia (`extractFromJsonApi` é chamada dentro do próprio `learnSiteConfig`), então a cobertura mostrada no cadastro desses três é genuína, não mascarada.
- **Cutrim Imobiliaria** (`html_css`, `confidence_score: 0.5`): rodei a paginação real contra o site — a página 1 sozinha já tem os 200 imóveis (bate com o `total_listings_hint`); o parâmetro de paginação que a IA "adivinhou" (`?paged=N`, sinalizado como não confirmado no próprio warning) nem funciona de verdade nesse site, mas não faz diferença porque não sobra nada pra paginar. Cobertura genuína, apesar da confiança baixa (a IA estava certa em ter dúvida — só que a dúvida não se concretizou).
- **Realler Imoveis** (`html_css`, `confidence_score: 0.75`, `pagination.type: "none"`): buscada a página 1 ao vivo — 182 cards, nenhuma menção textual de total em lugar nenhum do HTML pra cruzar. **Status: incerto, registrado deliberadamente sem forçar uma decisão.** Diferente do `mullerimoveisrj` (que tinha uma prova concreta — "última página: 135" — de que faltava cobertura), aqui não existe nenhum sinal de que falta alguma coisa, mas também não existe prova positiva de que 182 é o catálogo inteiro. O próprio warning da IA já suspeitava disso ("pode ser que a listagem carregue todos os imóveis de uma vez"). Fica como está até haver evidência em qualquer direção — não vale a pena adivinhar.

**Duas correções implementadas** (pedidas explicitamente pelo usuário, não decididas sozinho):

1. **Causa raiz** — `site-config-schema.ts` (`total_listings_hint`) e `config-generator.ts` (`SYSTEM_PROMPT`) agora instruem a IA a estimar `total_listings_hint` a partir do número da última página × cards visíveis na página atual, quando não houver menção explícita de total — e a registrar isso como estimativa (não contagem exata) em `warnings`. **Revalidado com chamada real de IA** contra `mullerimoveisrj.com.br` depois da mudança: `totalListingsHint: 1080` (135 × 8, muito próximo dos 1075 medidos via paginação real), warning explícito dizendo que é estimativa, e a rede de segurança **disparou de verdade** (`jsonApiDetection: "not_found"` — tentou achar uma API JSON por trás da paginação, corretamente não achou, porque este site é WordPress renderizado no servidor, não uma SPA).

2. **Rede de segurança visual** — `RegisterCompetitorState.learning` ganhou `paginationDetectedWithoutTotal` (`lib/competitors/actions.ts`): `true` quando a paginação foi detectada (`html_css` com `pagination.type != 'none'`) mas mesmo assim não foi possível estimar um total (nem menção explícita, nem número de última página — o caso do Realler). A tela de revisão do cadastro (`register-form.tsx`) mostra um aviso explícito nesse caso: "Não sabemos o total real de imóveis do site, mas ele tem paginação... esta prévia mostra só uma amostra da página 1". `json_api` nunca marca essa flag — sua prévia já é exaustiva por natureza.
