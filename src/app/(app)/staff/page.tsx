import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth";

export default async function LegacyStaffRedirectPage() {
  await requireSuperAdmin();
  redirect("/admin/accounts");
}
