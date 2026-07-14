"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getProfile, roleHome } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit/log";
import { LEGAL_DOCUMENT_VERSIONS } from "./content";

export interface AcceptTermsState {
  error?: string;
}

// Grava o aceite dos DOIS documentos de uma vez, mesmo que só um tenha
// mudado de versão — um único checkbox na tela ("Li e aceito os Termos de
// Uso e a Política de Privacidade"), então é uma ação só do ponto de vista
// do usuário. Upsert (não insert puro): reaceitar a MESMA versão já
// aceita (ex: usuário volta a esta tela por engano) não deve gerar linha
// duplicada nem erro de constraint única.
export async function acceptTermsAction(): Promise<AcceptTermsState> {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const rows = (Object.entries(LEGAL_DOCUMENT_VERSIONS) as [keyof typeof LEGAL_DOCUMENT_VERSIONS, string][]).map(
    ([documentType, version]) => ({
      user_id: profile.id,
      document_type: documentType,
      version,
    })
  );

  const { error } = await supabase
    .from("terms_acceptance")
    .upsert(rows, { onConflict: "user_id,document_type,version" });
  if (error) return { error: `Falha ao registrar aceite: ${error.message}` };

  await logAuditEvent({
    actorUserId: profile.id,
    accountId: profile.account_id,
    actionType: "terms_accepted",
    details: { ...LEGAL_DOCUMENT_VERSIONS },
  });

  revalidatePath("/", "layout");
  redirect(roleHome(profile.role));
}
