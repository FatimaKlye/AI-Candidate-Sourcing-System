import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { SignOutButton } from "@/components/dashboard/SignOutButton";
import { getHrSession } from "@/lib/hr/context";

export default async function AccessPendingPage() {
  const { user, workspace } = await getHrSession();
  if (!user) redirect("/login");
  if (workspace) redirect("/dashboard");
  return <AuthLayout title="Access not approved" subtitle="Your account is authenticated but is not on the private HR allowlist."><div className="space-y-4 text-center"><p className="text-sm leading-6 text-slate-600">Ask your organization&apos;s provisioning contact to approve <strong>{user.email}</strong> before you try again.</p><div className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">No job, candidate, note, or activity data has been disclosed to this account.</div><SignOutButton /></div></AuthLayout>;
}
