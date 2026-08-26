import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface HrWorkspace {
  id: string;
  name: string;
  settings: {
    weights?: Record<string, number>;
    default_minimum_match_score?: number;
  };
}

export async function getHrSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, workspace: null, profile: null };
  }

  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("full_name, email, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  if (!membership?.workspace_id) {
    return { supabase, user, workspace: null, profile };
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, name, settings")
    .eq("id", membership.workspace_id)
    .maybeSingle();

  return {
    supabase,
    user,
    workspace: (workspace as HrWorkspace | null) ?? null,
    profile,
  };
}

export async function requireHrContext() {
  const context = await getHrSession();
  if (!context.user) redirect("/login");
  if (!context.workspace) redirect("/access-pending");
  return {
    ...context,
    user: context.user,
    workspace: context.workspace,
  };
}
