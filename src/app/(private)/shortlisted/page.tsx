import { MatchTable, type MatchListItem } from "@/components/candidates/MatchTable";
import { requireHrContext } from "@/lib/hr/context";

export default async function ShortlistedPage() {
  const { supabase, workspace } = await requireHrContext();
  const { data } = await supabase.from("candidate_matches").select("id, overall_score, review_status, shortlisted, created_at, candidates(id, full_name, current_title, current_company, location, source, skills), jobs(id, search_name)").eq("workspace_id", workspace.id).eq("shortlisted", true).order("last_activity_at", { ascending: false, nullsFirst: false });
  return <div className="space-y-6"><div><h1 className="text-3xl font-semibold tracking-tight text-slate-950">Shortlisted applicants</h1><p className="mt-2 text-sm text-slate-500">Candidates selected by HR for follow-up. No contact is automated.</p></div><MatchTable matches={(data ?? []) as unknown as MatchListItem[]} emptyMessage="No candidates have been shortlisted." /></div>;
}
