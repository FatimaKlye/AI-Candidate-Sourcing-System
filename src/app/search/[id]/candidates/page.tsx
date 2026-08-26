import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function CandidateSearchPage({
  params,
}: PageProps<"/search/[id]/candidates">) {
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
            href={`/search/${id}/queries`}
            className="text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            ← Back to search queries
          </Link>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-2xl font-semibold text-slate-900">
              Candidate Sourcing
            </h1>
            <p className="mt-2 text-slate-500">
              Candidate sourcing is coming soon. We&apos;ll use these requirements
              to find matching candidates here.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
