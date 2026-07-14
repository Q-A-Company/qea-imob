import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LEGAL_DOCUMENT_VERSIONS, type LegalDocumentType } from "./content";

// true só quando o usuário já aceitou a versão ATUAL dos dois documentos —
// nunca "os dois juntos como uma coisa só" (cada document_type tem sua
// própria versão em LEGAL_DOCUMENT_VERSIONS), mas o gate em si trata os
// dois como um bloco (ver acceptTermsAction, lib/legal/actions.ts).
export async function isTermsUpToDate(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("terms_acceptance").select("document_type, version").eq("user_id", userId);

  const acceptedVersion = new Map((data ?? []).map((row) => [row.document_type, row.version]));
  const documentTypes = Object.keys(LEGAL_DOCUMENT_VERSIONS) as LegalDocumentType[];
  return documentTypes.every((type) => acceptedVersion.get(type) === LEGAL_DOCUMENT_VERSIONS[type]);
}

// Chamado de dois pontos — requireRole() (dal.ts) e (dashboard)/layout.tsx,
// os dois lugares que hoje decidem "profile válido, pode passar" — porque
// este projeto não tem middleware.ts, então não existe um único checkpoint
// central; cada um dos dois precisa checar isso na entrada.
export async function requireAcceptedTerms(userId: string): Promise<void> {
  if (!(await isTermsUpToDate(userId))) redirect("/aceitar-termos");
}
