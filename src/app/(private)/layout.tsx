import { ReactNode } from "react";
import { AppShell } from "@/components/app/AppShell";
import { requireHrContext } from "@/lib/hr/context";

export default async function PrivateLayout({ children }: { children: ReactNode }) {
  const { user, workspace, profile } = await requireHrContext();
  return (
    <AppShell
      workspaceName={workspace.name}
      displayName={profile?.full_name || user.email || "HR user"}
    >
      <div className="mx-auto w-full max-w-7xl">{children}</div>
    </AppShell>
  );
}
