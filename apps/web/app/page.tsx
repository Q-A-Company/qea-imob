import { redirect } from "next/navigation";
import { getProfile, roleHome } from "@/lib/auth/dal";

export default async function RootPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  redirect(roleHome(profile.role));
}
