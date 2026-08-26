"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { calculateRanking, toggleShortlist } from "@/lib/jobs/ranking-actions";
import {
  ANALYSIS_CATEGORY_LABELS,
  type AnalysisCategory,
  type CandidateMatchWithCandidate,
} from "@/lib/jobs/ranking-schema";

interface RankingViewProps {
  jobId: string;
  hasRequirements: boolean;
  hasCandidates: boolean;
  initialMatches: CandidateMatchWithCandidate[];
}

type Status = "idle" | "calculating" | "ready" | "error";
type SortBy = "best" | "lowest" | "name";

const ALL_FILTER = "All";
const ANALYSIS_ORDER: AnalysisCategory[] = [
  "must_have",
  "preferred",
  "skills",
  "industry",
  "seniority",
  "location",
  "experience",
];

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function industryStatus(match: CandidateMatchWithCandidate): string {
  return match.analysis.find((item) => item.category === "industry")?.status ?? "Not Confirmed";
}

function scoreBadgeClass(score: number): string {
  if (score >= 80) return "bg-emerald-50 text-emerald-700";
  if (score >= 50) return "bg-amber-50 text-amber-800";
  return "bg-red-50 text-red-700";
}

function statusTextClass(status: string): string {
  if (status === "Match") return "text-emerald-700";
  if (status === "Partial") return "text-amber-700";
  return "text-slate-500";
}

export function RankingView({
  jobId,
  hasRequirements,
  hasCandidates,
  initialMatches,
}: RankingViewProps) {
  const router = useRouter();

  const [status, setStatus] = useState<Status>(initialMatches.length > 0 ? "ready" : "idle");
  const [matches, setMatches] = useState<CandidateMatchWithCandidate[]>(initialMatches);
  const [error, setError] = useState<string | null>(null);
  const [minScore, setMinScore] = useState(0);
  const [companyFilter, setCompanyFilter] = useState(ALL_FILTER);
  const [locationFilter, setLocationFilter] = useState(ALL_FILTER);
  const [industryFilter, setIndustryFilter] = useState(ALL_FILTER);
  const [sortBy, setSortBy] = useState<SortBy>("best");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingShortlistIds, setPendingShortlistIds] = useState<Set<string>>(new Set());

  const [isCalculating, startCalculating] = useTransition();
  const [isContinuing, startContinuing] = useTransition();

  function runCalculation() {
    setStatus("calculating");
    setError(null);

    startCalculating(async () => {
      const result = await calculateRanking(jobId);
      if (result.error || !result.data) {
        setStatus("error");
        setError(result.error ?? "Something went wrong. Please try again.");
        return;
      }

      setMatches(result.data);
      setStatus("ready");
    });
  }

  async function handleToggleShortlist(match: CandidateMatchWithCandidate) {
    setPendingShortlistIds((prev) => new Set(prev).add(match.id));
    const nextShortlisted = !match.shortlisted;
    const result = await toggleShortlist(jobId, match.id, nextShortlisted);
    if (!result.error) {
      setMatches((prev) =>
        prev.map((m) => (m.id === match.id ? { ...m, shortlisted: nextShortlisted } : m)),
      );
    }
    setPendingShortlistIds((prev) => {
      const next = new Set(prev);
      next.delete(match.id);
      return next;
    });
  }

  function handleContinue() {
    startContinuing(async () => {
      router.push(`/search/${jobId}/contact-discovery`);
    });
  }

  const filterOptions = useMemo(
    () => ({
      company: uniqueSorted(matches.map((m) => m.candidate.current_company)),
      location: uniqueSorted(matches.map((m) => m.candidate.location)),
    }),
    [matches],
  );

  const visibleMatches = useMemo(() => {
    const filtered = matches.filter((match) => {
      if (match.overall_score < minScore) return false;
      if (companyFilter !== ALL_FILTER && match.candidate.current_company !== companyFilter) {
        return false;
      }
      if (locationFilter !== ALL_FILTER && match.candidate.location !== locationFilter) {
        return false;
      }
      if (industryFilter !== ALL_FILTER && industryStatus(match) !== industryFilter) {
        return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "best") return b.overall_score - a.overall_score;
      if (sortBy === "lowest") return a.overall_score - b.overall_score;
      return a.candidate.full_name.localeCompare(b.candidate.full_name);
    });
  }, [matches, minScore, companyFilter, locationFilter, industryFilter, sortBy]);

  if (!hasRequirements) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Analyze the job description before ranking candidates.
        </p>
        <Link
          href={`/search/${jobId}/analysis`}
          className="inline-flex w-fit items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          Go to Job Analysis
        </Link>
      </div>
    );
  }

  if (!hasCandidates) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Discover candidates before ranking them.
        </p>
        <Link
          href={`/search/${jobId}/candidates`}
          className="inline-flex w-fit items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          Go to Candidate Discovery
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {status === "calculating" && (
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
          <p className="text-sm font-medium text-slate-700">
            Comparing candidates against the job requirements...
          </p>
        </div>
      )}

      {status === "error" && error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={runCalculation} isLoading={isCalculating}>
          {matches.length > 0 ? "Recalculate Ranking" : "Calculate Ranking"}
        </Button>
      </div>

      {matches.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700">Minimum Match Score</label>
              <select
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                {[0, 25, 50, 60, 70, 80, 90].map((value) => (
                  <option key={value} value={value}>
                    {value}%+
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700">Company</label>
              <select
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value={ALL_FILTER}>All</option>
                {filterOptions.company.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700">Location</label>
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value={ALL_FILTER}>All</option>
                {filterOptions.location.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700">Industry</label>
              <select
                value={industryFilter}
                onChange={(e) => setIndustryFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value={ALL_FILTER}>All</option>
                <option value="Match">Match</option>
                <option value="Partial">Partial</option>
                <option value="Not Confirmed">Not Confirmed</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700">Sort by</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="best">Best Match</option>
              <option value="lowest">Lowest Match</option>
              <option value="name">Name</option>
            </select>
          </div>
        </>
      )}

      <div className="flex flex-col gap-3">
        {matches.length === 0 && status !== "calculating" && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
            No ranking yet. Calculate ranking to score discovered candidates against the job
            requirements.
          </p>
        )}

        {matches.length > 0 && visibleMatches.length === 0 && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
            No candidates match the selected filters.
          </p>
        )}

        {visibleMatches.map((match, index) => (
          <div
            key={match.id}
            className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  #{index + 1}
                </p>
                <p className="text-base font-semibold text-slate-900">
                  {match.candidate.full_name}
                </p>
                <p className="text-sm text-slate-600">
                  {match.candidate.current_title} · {match.candidate.current_company}
                </p>
                <p className="text-sm text-slate-500">{match.candidate.location}</p>
              </div>
              <span
                className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-sm font-semibold ${scoreBadgeClass(
                  match.overall_score,
                )}`}
              >
                {match.overall_score}%
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Strong Matches
                </p>
                {match.strengths.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-400">None confirmed.</p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {match.strengths.map((item) => (
                      <li key={item} className="text-sm text-emerald-700">
                        ✓ {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Missing / Unconfirmed
                </p>
                {match.missing_requirements.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-400">None.</p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {match.missing_requirements.map((item) => (
                      <li key={item} className="text-sm text-amber-700">
                        △ {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
              <Button
                type="button"
                variant="outline"
                className="px-3 py-1.5 text-xs"
                onClick={() => setExpandedId((prev) => (prev === match.id ? null : match.id))}
              >
                {expandedId === match.id ? "Hide Full Analysis" : "View Full Analysis"}
              </Button>
              <Button
                type="button"
                variant={match.shortlisted ? "secondary" : "outline"}
                className="px-3 py-1.5 text-xs"
                isLoading={pendingShortlistIds.has(match.id)}
                onClick={() => handleToggleShortlist(match)}
              >
                {match.shortlisted ? "Shortlisted" : "Add to Shortlist"}
              </Button>
            </div>

            {expandedId === match.id && (
              <div className="flex flex-col gap-4 rounded-lg bg-slate-50 p-4">
                {ANALYSIS_ORDER.map((category) => {
                  const items = match.analysis.filter((item) => item.category === category);
                  if (items.length === 0) return null;
                  return (
                    <div key={category}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {ANALYSIS_CATEGORY_LABELS[category]}
                      </p>
                      <div className="mt-1 flex flex-col gap-2">
                        {items.map((item, itemIndex) => (
                          <div key={`${category}-${itemIndex}`} className="text-sm">
                            <p className="font-medium text-slate-900">{item.requirement}</p>
                            <p className={statusTextClass(item.status)}>Status: {item.status}</p>
                            {item.status === "Match" && (
                              <p className="text-slate-500">Evidence: {item.evidence}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
          Continue to Contact Discovery
        </Button>
      </div>
    </div>
  );
}
