import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function JobDetailPage({
  params,
}: PageProps<"/search/[id]">) {
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
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!job) {
    notFound();
  }

  let fileUrl: string | null = null;
  if (job.file_path) {
    const { data } = await supabase.storage
      .from("job-descriptions")
      .createSignedUrl(job.file_path, 60 * 5);
    fileUrl = data?.signedUrl ?? null;
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
            href="/dashboard"
            className="text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            ← Back to dashboard
          </Link>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">
                  {job.search_name}
                </h1>
                <p className="mt-1 text-slate-500">
                  {job.company_name || "No company specified"}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-700">
                {job.status}
              </span>
            </div>

            <div className="mt-6 border-t border-slate-100 pt-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                Job Description
              </h2>
              {job.jd_text ? (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {job.jd_text}
                </p>
              ) : fileUrl ? (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-500"
                >
                  {job.file_name}
                </a>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  No job description available.
                </p>
              )}
            </div>

            <div className="mt-8 border-t border-slate-100 pt-6">
              {job.jd_text || job.file_path ? (
                <Link
                  href={`/search/${id}/analysis`}
                  className="flex w-full items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
                >
                  Continue
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="w-full cursor-not-allowed rounded-lg bg-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-500"
                  title="Add a job description before continuing."
                >
                  Continue
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
