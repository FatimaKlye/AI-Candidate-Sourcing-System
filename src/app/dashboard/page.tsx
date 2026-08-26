import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/dashboard/SignOutButton";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const displayName =
    profile?.full_name || user.user_metadata?.full_name || user.email;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <span className="text-xl font-bold text-slate-900">
          Talent<span className="text-indigo-600">AI</span>
        </span>
        <SignOutButton />
      </header>
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">
            Welcome, {displayName}
          </h1>
          <p className="mt-2 text-slate-500">
            Start your first candidate search.
          </p>
          <button
            type="button"
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            New Search
          </button>
        </div>
      </main>
    </div>
  );
}
