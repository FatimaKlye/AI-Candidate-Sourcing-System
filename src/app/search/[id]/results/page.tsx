import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FindCandidatesView } from "@/components/search/FindCandidatesView";
import type { CandidateMatchWithCandidate } from "@/lib/jobs/ranking-schema";
import type { CandidateContact } from "@/lib/jobs/contacts-schema";

export default async function FindCandidatesPage({
  params,
}: PageProps<"/search/[id]/results">) {
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
    .select("id, search_name, jd_text, file_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!job) {
    notFound();
  }

  const { data: matches } = await supabase
    .from("candidate_matches")
    .select("*, candidate:candidates(*)")
    .eq("job_id", id)
    .eq("user_id", user.id)
    .order("overall_score", { ascending: false });

  const { data: contacts } = await supabase
    .from("candidate_contacts")
    .select("*")
    .eq("job_id", id)
    .eq("user_id", user.id);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <Link href="/dashboard" className="text-xl font-bold text-slate-900">
          Talent<span className="text-indigo-600">AI</span>
        </Link>
      </header>
      <main className="flex flex-1 justify-center px-4 py-10">
        <div className="w-full max-w-3xl">
          <Link
            href={`/search/${id}`}
            className="text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            ← Back to job
          </Link>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-semibold text-slate-900">{job.search_name}</h1>
            <p className="mt-1 text-slate-500">
              Ranked candidates found automatically from public sources.
            </p>

            <div className="mt-6 border-t border-slate-100 pt-6">
              <FindCandidatesView
                jobId={id}
                hasJobDescription={Boolean(job.jd_text || job.file_path)}
                initialMatches={(matches ?? []) as unknown as CandidateMatchWithCandidate[]}
                initialContacts={(contacts ?? []) as CandidateContact[]}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
