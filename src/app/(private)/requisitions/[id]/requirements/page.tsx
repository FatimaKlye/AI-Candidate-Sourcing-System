import Link from "next/link";
import { notFound } from "next/navigation";
import { JobAnalysisView } from "@/components/search/JobAnalysisView";
import { requireHrContext } from "@/lib/hr/context";
import type { JobRequirements } from "@/lib/jobs/analysis-schema";

export default async function RequirementsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, workspace } = await requireHrContext();
  const [{ data: job }, { data: requirements }] = await Promise.all([
    supabase.from("jobs").select("id, search_name").eq("id", id).eq("workspace_id", workspace.id).maybeSingle(),
    supabase.from("job_requirements").select("*").eq("job_id", id).maybeSingle(),
  ]);
  if (!job) notFound();
  return <div className="mx-auto max-w-3xl space-y-6"><div><Link href={`/requisitions/${id}`} className="text-sm font-semibold text-cyan-700">← {job.search_name}</Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Review extracted requirements</h1><p className="mt-2 text-sm text-slate-500">Ollama extracts only stated qualifications. HR approval is required before sourcing.</p></div><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><JobAnalysisView jobId={id} initialRequirements={requirements as JobRequirements | null} /></section></div>;
}
