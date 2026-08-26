import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewSearchWizard } from "@/components/search/NewSearchWizard";

export default async function NewSearchPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
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
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-semibold text-slate-900">
              New Candidate Search
            </h1>
            <p className="mt-2 text-slate-500">
              Upload or paste a job description to start finding matching
              candidates.
            </p>
          </div>
          <NewSearchWizard />
        </div>
      </main>
    </div>
  );
}
