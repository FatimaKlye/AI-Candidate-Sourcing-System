import Link from "next/link";
import { requireHrContext } from "@/lib/hr/context";

function Stat({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-400">{detail}</p></div>;
}

export default async function DashboardPage() {
  const { supabase, workspace, profile, user } = await requireHrContext();
  const [jobsResult, matchesResult, shortlistResult, recentResult, activityResult] = await Promise.all([
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).is("archived_at", null),
    supabase.from("candidate_matches").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id),
    supabase.from("candidate_matches").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).eq("shortlisted", true),
    supabase.from("jobs").select("id, search_name, department, location, status, minimum_match_score, created_at").eq("workspace_id", workspace.id).is("archived_at", null).order("created_at", { ascending: false }).limit(5),
    supabase.from("activity_logs").select("id, event_type, metadata, created_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(6),
  ]);
  const displayName = profile?.full_name || user.email?.split("@")[0] || "HR partner";

  return <div className="space-y-8">
    <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="text-sm font-semibold text-cyan-700">PRIVATE HR WORKSPACE</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Good to see you, {displayName}</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">Review active requisitions, candidate matches, and team activity from one secure workspace.</p></div>
      <Link href="/requisitions/new" className="inline-flex items-center justify-center rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">Create requisition</Link>
    </section>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Active requisitions" value={jobsResult.count ?? 0} detail="Open hiring searches" />
      <Stat label="Matched applicants" value={matchesResult.count ?? 0} detail="Across approved sources" />
      <Stat label="Shortlisted" value={shortlistResult.count ?? 0} detail="Awaiting HR follow-up" />
      <Stat label="Minimum score" value={Number(workspace.settings?.default_minimum_match_score ?? 70)} detail="Workspace recommendation threshold" />
    </section>
    <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-semibold text-slate-950">Recent requisitions</h2><p className="text-xs text-slate-500">Shared across the HR team</p></div><Link href="/requisitions" className="text-sm font-semibold text-cyan-700 hover:text-cyan-600">View all</Link></div>
        <div className="divide-y divide-slate-100">{(recentResult.data ?? []).map((job) => <Link key={job.id} href={`/requisitions/${job.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50"><div><p className="font-medium text-slate-900">{job.search_name}</p><p className="mt-1 text-xs text-slate-500">{[job.department, job.location].filter(Boolean).join(" · ") || "Details pending"}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-600">{job.status}</span></Link>)}{recentResult.data?.length === 0 && <p className="px-5 py-10 text-center text-sm text-slate-500">No requisitions yet.</p>}</div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-950">Team activity</h2><p className="text-xs text-slate-500">Recent auditable actions</p></div><div className="space-y-4 p-5">{(activityResult.data ?? []).map((item) => <div key={item.id} className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-cyan-500"/><div><p className="text-sm font-medium capitalize text-slate-800">{item.event_type.replaceAll("_", " ")}</p><p className="text-xs text-slate-400">{new Date(item.created_at).toLocaleString()}</p></div></div>)}{activityResult.data?.length === 0 && <p className="text-sm text-slate-500">Activity will appear here as the team works.</p>}<Link href="/activity" className="inline-flex text-sm font-semibold text-cyan-700">Open activity log</Link></div></section>
    </div>
  </div>;
}
