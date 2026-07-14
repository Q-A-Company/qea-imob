import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

export type LegalDocumentType = "termos" | "privacidade";

// Identificador de versão explícito, não derivado por parsing da linha
// "Última atualização" dentro do .md (frágil — quebraria se alguém
// reformatar essa linha sem querer). Precisa ser atualizado a mão, no
// MESMO commit que mexer no texto correspondente, senão ninguém é
// obrigado a re-aceitar uma mudança real.
export const LEGAL_DOCUMENT_VERSIONS: Record<LegalDocumentType, string> = {
  termos: "2026-07-14",
  privacidade: "2026-07-14",
};

const FILE_NAME: Record<LegalDocumentType, string> = {
  termos: "termos.md",
  privacidade: "privacidade.md",
};

// Lido direto do filesystem (não importado como módulo) — conteúdo estático
// versionado no repo (apps/web/content/legal/), decisão confirmada com o
// usuário: editar exige commit+deploy, sem tabela nova só pra texto que
// muda raramente.
export function getLegalDocumentMarkdown(type: LegalDocumentType): string {
  const filePath = path.join(process.cwd(), "content", "legal", FILE_NAME[type]);
  return readFileSync(filePath, "utf8");
}
