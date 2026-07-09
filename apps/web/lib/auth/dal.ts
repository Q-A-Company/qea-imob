import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/supabase/types";

export interface Profile {
  id: string;
  account_id: string | null;
  role: UserRole;
  full_name: string | null;
}

export function roleHome(role: UserRole) {
  switch (role) {
    case "superadmin":
      return "/superadmin";
    case "admin":
      return "/admin";
    case "usuario":
      return "/user";
  }
}

// cache() memoiza por request — getUser() revalida o JWT junto ao Supabase
// Auth, então é seguro para decisões de autorização (ao contrário de
// getSession(), que só lê o cookie sem revalidar).
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, account_id, role, full_name")
    .eq("id", user.id)
    .single();

  return profile;
});

export async function requireRole(role: UserRole | UserRole[]): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const allowed = Array.isArray(role) ? role : [role];
  if (!allowed.includes(profile.role)) {
    redirect(roleHome(profile.role));
  }

  return profile;
}
