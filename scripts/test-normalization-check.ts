import { normalizeExternalId } from "../packages/scraper/core/text-utils.js";

const rawExamples = ["Ref: 0028", "Cod.: 5105", "Código:CWCN40306", "Ref:0137", "CódIGO: 12345"];
for (const raw of rawExamples) {
  console.log(`"${raw}" -> "${normalizeExternalId(raw)}"`);
}
