"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { deleteJob } from "@/lib/jobs/actions";
import type { Job } from "@/lib/jobs/types";
import { cn } from "@/lib/utils";

type SearchListItem = Pick<
  Job,
  "id" | "search_name" | "company_name" | "status" | "created_at"
>;

interface RecentSearchesProps {
  jobs: SearchListItem[];
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
};

export function RecentSearches({ jobs }: RecentSearchesProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleDelete(id: string, searchName: string) {
    if (!window.confirm(`Delete "${searchName}"? This cannot be undone.`)) {
      return;
    }
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const result = await deleteJob(id);
      if (result?.error) {
        setError(result.error);
      }
      setPendingId(null);
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Recent Searches</h2>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {jobs.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          You haven&apos;t started a search yet. Click &quot;New Search&quot;
          above to get started.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="flex flex-wrap items-center justify-between gap-3 py-4"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">
                  {job.search_name}
                </p>
                <p className="mt-0.5 text-sm text-slate-500">
                  {job.company_name || "No company specified"} ·{" "}
                  {new Date(job.created_at).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                    STATUS_STYLES[job.status] ?? "bg-slate-100 text-slate-700",
                  )}
                >
                  {job.status}
                </span>
                <Link
                  href={`/search/${job.id}`}
                  className="text-sm font-semibold text-indigo-600 hover:text-indigo-500"
                >
                  Continue
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(job.id, job.search_name)}
                  disabled={isPending && pendingId === job.id}
                  className="text-sm font-medium text-red-600 hover:text-red-500 disabled:opacity-60"
                >
                  {isPending && pendingId === job.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
