"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
  success?: boolean;
}

// "Botão de emergência" — pausa TODO envio de e-mail da plataforma
// (resumo diário de todas as contas), independente do que cada conta tem
// em notification_settings.email_enabled. Checado em
// packages/scraper/jobs/send-daily-digest.ts antes de processar qualquer
// conta.
export async function updateGlobalEmailToggleAction(enabled: boolean): Promise<ActionState> {
  await requireRole("superadmin");
  const supabase = await createClient();
  const { error } = await supabase
    .from("system_settings")
    .update({ email_globally_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return { error: `Falha ao atualizar: ${error.message}` };
  revalidatePath("/superadmin/system");
  return { success: true };
}
