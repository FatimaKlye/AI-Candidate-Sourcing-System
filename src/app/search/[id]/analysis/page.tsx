import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { JobAnalysisView } from "@/components/search/JobAnalysisView";
import type { JobRequirements } from "@/lib/jobs/analysis-schema";

export default async function JobAnalysisPage({
  params,
}: PageProps<"/search/[id]/analysis">) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!job) {
    notFound();
  }

  const { data: requirements } = await supabase
    .from("job_requirements")
    .select("*")
    .eq("job_id", id)
    .maybeSingle();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <Link href="/dashboard" className="text-xl font-bold text-slate-900">
          Talent<span className="text-indigo-600">AI</span>
        </Link>
      </header>
      <main className="flex flex-1 justify-center px-4 py-10">
        <div className="w-full max-w-2xl">
          <Link
            href={`/search/${id}`}
            className="text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            ← Back to job
          </Link>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-semibold text-slate-900">
              Job Analysis
            </h1>
            <p className="mt-1 text-slate-500">
              Review the requirements before starting candidate sourcing.
            </p>

            <div className="mt-6 border-t border-slate-100 pt-6">
              <JobAnalysisView
                jobId={id}
                initialRequirements={requirements as JobRequirements | null}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
