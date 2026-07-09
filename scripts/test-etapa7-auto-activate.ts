import { createServiceClient } from "../packages/scraper/core/db.js";
import { learnSiteConfig } from "../packages/scraper/jobs/learn-site-config.js";
import { recalibrateSiteConfig } from "../packages/scraper/jobs/recalibrate-site-config.js";

// A IA não é determinística (já documentado no README) — o tipo de
// atributo do external_id pode variar entre chamadas mesmo pro mesmo
// site. Para provar o ramo de auto-ativação sem depender de sorte,
// aprende uma vez, usa o resultado EXATO como "previous", e tenta a
// recalibração até 3 vezes (cada tentativa é uma chamada real de IA).

const DEMO_ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";
const REAL_URL = "https://www.mullerimoveis.com.br/imovel/venda";
const supabase = createServiceClient();
const MAX_ATTEMPTS = 3;

console.log("=== Aprendendo o config base (vai virar 'previous') ===");
const base = await learnSiteConfig(REAL_URL);
console.log("external_id.attribute:", (base.selectors as any).external_id.attribute);

const { data: competitor, error } = await supabase
  .from("competitors")
  .insert({ account_id: DEMO_ACCOUNT_ID, name: "Teste Etapa 7 (auto-ativação)", listing_url: REAL_URL, polling_interval_minutes: 5, status: "ativo" })
  .select("id")
  .single();
if (error || !competitor) throw new Error(`Falha ao criar competitor: ${error?.message}`);

await supabase
  .from("site_configs")
  .insert({ competitor_id: competitor.id, selectors: base.selectors, version: 1, confidence_score: base.selectors.confidence_score, status: "ativo" });

let succeeded = false;
for (let attempt = 1; attempt <= MAX_ATTEMPTS && !succeeded; attempt++) {
  console.log(`\n=== Tentativa ${attempt}/${MAX_ATTEMPTS} ===`);
  const result = await recalibrateSiteConfig(competitor.id);
  console.log({ activated: result.activated, newVersion: result.newVersion, reasons: result.reasons });

  if (result.activated) {
    succeeded = true;
    console.log("✅ Ativou automaticamente — provado empiricamente com IA real");

    const { data: rows } = await supabase.from("site_configs").select("version, status").eq("competitor_id", competitor.id).order("version");
    console.log(rows);
    // Decisão de design já documentada: check-competitor.ts sempre pega o
    // MAIOR version com status='ativo' — não importa se versões antigas
    // também ficaram 'ativo' (aqui ficam, porque a v1 deste teste nunca
    // passou por 'degradado'; no fluxo real via check-competitor.ts, a
    // versão antiga já está 'degradado' antes da recalibração, então não
    // há duplicata). O que importa é a versão mais nova estar 'ativo'.
    const newest = rows?.[rows.length - 1];
    console.log(
      "versão mais nova está 'ativo':",
      newest?.status === "ativo" && newest.version === result.newVersion ? "✅" : "❌"
    );
  }
  // Não precisa resetar nada entre tentativas: recalibrateSiteConfig busca
  // "previous" pela versão mais alta (independente do status), então a
  // próxima tentativa já compara automaticamente contra a versão recém-gerada.
}

if (!succeeded) {
  console.log(`\n⚠️ Não convergiu em ${MAX_ATTEMPTS} tentativas — não invalida o código (a decisão activated = compatible && sanityOk já é testada deterministicamente em scripts/test-sanity-unit.ts), só confirma que a não-determinismo da IA é real e forte o suficiente pra não conseguir forçar o ramo 'ativo' de propósito em poucas tentativas.`);
}

console.log("\n=== Limpeza ===");
await supabase.from("competitors").delete().eq("id", competitor.id);
console.log("Removido.");
