"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

// Não usa requireRole — qualquer usuário autenticado com conta (admin ou
// usuario) pode marcar suas próprias notificações como lidas. A policy RLS
// "account_members_update_own" já restringe o UPDATE a account_id =
// current_account_id(), então o filtro .eq("id", ...) é seguro mesmo sem
// reverificação manual de posse: a sessão do usuário via createClient() é
// RLS-scoped, não service-role.
export async function markNotificationReadAction(notificationId: string): Promise<void> {
  const profile = await getProfile();
  if (!profile || !profile.account_id) return;

  const supabase = await createClient();
  await supabase.from("notifications").update({ read: true }).eq("id", notificationId);
  revalidatePath("/", "layout");
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const profile = await getProfile();
  if (!profile || !profile.account_id) return;

  const supabase = await createClient();
  await supabase.from("notifications").update({ read: true }).eq("account_id", profile.account_id).eq("read", false);
  revalidatePath("/", "layout");
}
