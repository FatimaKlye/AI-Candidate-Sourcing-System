import { MatchTable, type MatchListItem } from "@/components/candidates/MatchTable";
import { requireHrContext } from "@/lib/hr/context";

export default async function MatchedApplicantsPage({ searchParams }: { searchParams: Promise<{ min?: string; status?: string }> }) {
  const filters = await searchParams;
  const { supabase, workspace } = await requireHrContext();
  const minimum = Math.min(100, Math.max(0, Number(filters.min ?? 0)));
  let query = supabase.from("candidate_matches").select("id, overall_score, review_status, shortlisted, created_at, candidates(id, full_name, current_title, current_company, location, source, skills), jobs(id, search_name)").eq("workspace_id", workspace.id).gte("overall_score", minimum).order("overall_score", { ascending: false });
  if (filters.status) query = query.eq("review_status", filters.status);
  const { data } = await query;
  return <div className="space-y-6"><div><h1 className="text-3xl font-semibold tracking-tight text-slate-950">Matched applicants</h1><p className="mt-2 text-sm text-slate-500">Auditable recommendations across every active requisition.</p></div><form className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4"><label className="text-sm font-medium text-slate-700">Minimum score <input name="min" type="number" min="0" max="100" defaultValue={minimum} className="ml-2 w-20 rounded-lg border border-slate-300 px-2 py-1.5"/></label><label className="text-sm font-medium text-slate-700">Status <select name="status" defaultValue={filters.status ?? ""} className="ml-2 rounded-lg border border-slate-300 px-2 py-1.5"><option value="">All</option>{["New","Under Review","Shortlisted","Contacted","Interview","Rejected","Archived"].map((status)=><option key={status}>{status}</option>)}</select></label><button className="rounded-lg bg-slate-950 px-4 py-1.5 text-sm font-semibold text-white">Apply filters</button></form><MatchTable matches={(data ?? []) as unknown as MatchListItem[]} emptyMessage="No candidates match these filters." /></div>;
}
