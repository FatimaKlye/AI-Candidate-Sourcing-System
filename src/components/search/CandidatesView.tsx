"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { runCandidateSearch, addCandidateManually } from "@/lib/jobs/candidates-actions";
import type { Candidate } from "@/lib/jobs/candidates-schema";

interface CandidatesViewProps {
  jobId: string;
  hasQueries: boolean;
  initialCandidates: Candidate[];
}

type Status = "idle" | "searching" | "ready" | "error";

const ALL_FILTER = "All";

const FILTER_FIELDS = [
  { key: "current_company", label: "Company" },
  { key: "location", label: "Location" },
  { key: "current_title", label: "Job Title" },
  { key: "source", label: "Source" },
] as const;

type FilterKey = (typeof FILTER_FIELDS)[number]["key"];
type Filters = Record<FilterKey, string>;

const EMPTY_FILTERS: Filters = {
  current_company: ALL_FILTER,
  location: ALL_FILTER,
  current_title: ALL_FILTER,
  source: ALL_FILTER,
};

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

const emptyManualDraft = {
  full_name: "",
  current_title: "",
  current_company: "",
  location: "",
  profile_url: "",
};

export function CandidatesView({ jobId, hasQueries, initialCandidates }: CandidatesViewProps) {
  const router = useRouter();

  const [status, setStatus] = useState<Status>(
    initialCandidates.length > 0 ? "ready" : "idle",
  );
  const [candidates, setCandidates] = useState<Candidate[]>(initialCandidates);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    searchesCompleted: number;
    totalSearches: number;
    possibleCandidatesFound: number;
  } | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualDraft, setManualDraft] = useState(emptyManualDraft);
  const [manualError, setManualError] = useState<string | null>(null);

  const [isSearching, startSearching] = useTransition();
  const [isAdding, startAdding] = useTransition();
  const [isContinuing, startContinuing] = useTransition();

  function runSearch() {
    setStatus("searching");
    setError(null);

    startSearching(async () => {
      const result = await runCandidateSearch(jobId);
      if (result.error || !result.data) {
        setStatus("error");
        setError(result.error ?? "Something went wrong. Please try again.");
        return;
      }

      setCandidates(result.data.candidates);
      setStats({
        searchesCompleted: result.data.stats.searchesCompleted,
        totalSearches: result.data.stats.totalSearches,
        possibleCandidatesFound: result.data.stats.possibleCandidatesFound,
      });
      setStatus("ready");
    });
  }

  function handleManualChange(field: keyof typeof emptyManualDraft, value: string) {
    setManualDraft((prev) => ({ ...prev, [field]: value }));
  }

  function handleAddCandidate() {
    setManualError(null);
    startAdding(async () => {
      const result = await addCandidateManually(jobId, manualDraft);
      if (result.error || !result.data) {
        setManualError(result.error ?? "Could not add the candidate. Please try again.");
        return;
      }

      setCandidates((prev) => [result.data as Candidate, ...prev]);
      setManualDraft(emptyManualDraft);
      setShowManualForm(false);
      setStatus("ready");
    });
  }

  function handleContinue() {
    startContinuing(async () => {
      router.push(`/search/${jobId}/ranking`);
    });
  }

  function openSource(candidate: Candidate) {
    const url = candidate.source_url ?? candidate.profile_url;
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const filterOptions = useMemo(() => {
    const options: Record<FilterKey, string[]> = {
      current_company: [],
      location: [],
      current_title: [],
      source: [],
    };
    for (const field of FILTER_FIELDS) {
      options[field.key] = uniqueSorted(candidates.map((c) => c[field.key]));
    }
    return options;
  }, [candidates]);

  const filteredCandidates = useMemo(() => {
    return candidates.filter((candidate) =>
      FILTER_FIELDS.every(({ key }) => {
        const filterValue = filters[key];
        return filterValue === ALL_FILTER || candidate[key] === filterValue;
      }),
    );
  }, [candidates, filters]);

  if (!hasQueries) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Save a search strategy before running candidate discovery.
        </p>
        <Link
          href={`/search/${jobId}/queries`}
          className="inline-flex w-fit items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          Go to Search Queries
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {status === "searching" && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 py-10 text-center">
          <svg
            className="h-8 w-8 animate-spin text-indigo-600"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
          <p className="text-sm font-medium text-slate-700">Searching public sources...</p>
        </div>
      )}

      {status === "error" && error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {stats && status !== "searching" && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <p>{stats.searchesCompleted} of {stats.totalSearches} searches completed</p>
          <p>{stats.possibleCandidatesFound} possible candidates found</p>
          <p>{candidates.length} unique candidates</p>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={runSearch} isLoading={isSearching}>
          Run Candidate Search
        </Button>
        <Button type="button" variant="outline" onClick={runSearch} isLoading={isSearching}>
          Refresh Results
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowManualForm((prev) => !prev)}
        >
          {showManualForm ? "Cancel" : "Add Candidate Manually"}
        </Button>
      </div>

      {showManualForm && (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Full Name"
              name="full_name"
              value={manualDraft.full_name}
              onChange={(e) => handleManualChange("full_name", e.target.value)}
              placeholder="Maria Santos"
            />
            <Input
              label="Current Title"
              name="current_title"
              value={manualDraft.current_title}
              onChange={(e) => handleManualChange("current_title", e.target.value)}
              placeholder="Finance Director"
            />
            <Input
              label="Current Company"
              name="current_company"
              value={manualDraft.current_company}
              onChange={(e) => handleManualChange("current_company", e.target.value)}
              placeholder="ABC Corporation"
            />
            <Input
              label="Location"
              name="location"
              value={manualDraft.location}
              onChange={(e) => handleManualChange("location", e.target.value)}
              placeholder="Philippines"
            />
            <Input
              label="Profile URL"
              name="profile_url"
              value={manualDraft.profile_url}
              onChange={(e) => handleManualChange("profile_url", e.target.value)}
              placeholder="https://linkedin.com/in/..."
              className="sm:col-span-2"
            />
          </div>
          {manualError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{manualError}</p>
          )}
          <Button
            type="button"
            onClick={handleAddCandidate}
            isLoading={isAdding}
            className="w-fit"
          >
            Save Candidate
          </Button>
        </div>
      )}

      {candidates.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FILTER_FIELDS.map(({ key, label }) => (
            <div key={key} className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700">{label}</label>
              <select
                value={filters[key]}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, [key]: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value={ALL_FILTER}>All</option>
                {filterOptions[key].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {candidates.length === 0 && status !== "searching" && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
            No candidates yet. Run a candidate search or add one manually.
          </p>
        )}

        {candidates.length > 0 && filteredCandidates.length === 0 && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
            No candidates match the selected filters.
          </p>
        )}

        {filteredCandidates.map((candidate) => (
          <div
            key={candidate.id}
            className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-base font-semibold text-slate-900">{candidate.full_name}</p>
                <p className="text-sm text-slate-600">
                  {candidate.current_title} · {candidate.current_company}
                </p>
                <p className="text-sm text-slate-500">{candidate.location}</p>
              </div>
              <span className="inline-flex w-fit shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                {candidate.source}
              </span>
            </div>
            {candidate.snippet && candidate.snippet !== "Not Found" && (
              <p className="line-clamp-2 text-sm text-slate-500">{candidate.snippet}</p>
            )}
            <Button
              type="button"
              variant="outline"
              className="w-fit px-3 py-1.5 text-xs"
              onClick={() => openSource(candidate)}
              disabled={!candidate.source_url && !candidate.profile_url}
            >
              Open Source
            </Button>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-100 pt-6">
        <Button
          type="button"
          onClick={handleContinue}
          isLoading={isContinuing}
          className="w-full sm:w-auto"
        >
          Continue to AI Ranking
        </Button>
      </div>
    </div>
  );
}
