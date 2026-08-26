import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveRequisition } from "@/lib/hr/actions";
import { requireHrContext } from "@/lib/hr/context";

export default async function RequisitionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, workspace } = await requireHrContext();
  const [{ data: job }, { data: requirements }, matches] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", id).eq("workspace_id", workspace.id).maybeSingle(),
    supabase.from("job_requirements").select("*").eq("job_id", id).maybeSingle(),
    supabase.from("candidate_matches").select("id", { count: "exact", head: true }).eq("job_id", id).eq("workspace_id", workspace.id),
  ]);
  if (!job) notFound();
  let fileUrl: string | null = null;
  if (job.file_path) {
    const { data } = await supabase.storage.from("job-descriptions").createSignedUrl(job.file_path, 300);
    fileUrl = data?.signedUrl ?? null;
  }
  const archive = archiveRequisition.bind(null, id);
  return <div className="space-y-7"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div><Link href="/requisitions" className="text-sm font-semibold text-cyan-700">← Job requisitions</Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{job.search_name}</h1><p className="mt-2 text-sm text-slate-500">{[job.department, job.location, job.employment_type].filter(Boolean).join(" · ") || "Hiring details pending"}</p></div><div className="flex flex-wrap gap-2"><Link href={`/requisitions/${id}/requirements`} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">Review requirements</Link><Link href={`/requisitions/${id}/candidates`} className="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">View applicants</Link></div></div>
  <div className="grid gap-5 md:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</p><p className="mt-2 font-semibold capitalize text-slate-900">{job.status}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Matched applicants</p><p className="mt-2 text-2xl font-semibold text-slate-900">{matches.count ?? 0}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Minimum score</p><p className="mt-2 text-2xl font-semibold text-slate-900">{job.minimum_match_score}%</p></div></div>
  <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]"><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-semibold text-slate-950">Job description</h2>{fileUrl && <a href={fileUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-cyan-700">Open {job.file_name || "file"}</a>}</div>{job.jd_text ? <p className="mt-4 max-h-[34rem] overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-slate-600">{job.jd_text}</p> : <p className="mt-4 text-sm text-slate-500">The description is stored in the uploaded document.</p>}</section><section className="space-y-5"><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="font-semibold text-slate-950">Extracted requirements</h2>{requirements ? <div className="mt-4 space-y-3 text-sm text-slate-600"><p><span className="font-medium text-slate-900">Title:</span> {requirements.job_title}</p><p><span className="font-medium text-slate-900">Seniority:</span> {requirements.seniority}</p><p><span className="font-medium text-slate-900">Experience:</span> {requirements.minimum_experience}</p><p><span className="font-medium text-slate-900">Required skills:</span> {requirements.required_skills?.join(", ") || "Pending"}</p></div> : <p className="mt-3 text-sm text-amber-700">Requirements have not been reviewed yet.</p>}<Link href={`/requisitions/${id}/requirements`} className="mt-5 inline-flex text-sm font-semibold text-cyan-700">{requirements ? "Edit requirements" : "Analyze description"} →</Link></div>{!job.archived_at && <form action={archive}><button className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Archive requisition</button></form>}</section></div></div>;
}
