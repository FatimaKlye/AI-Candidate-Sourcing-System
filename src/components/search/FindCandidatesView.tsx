"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { findCandidates } from "@/lib/jobs/pipeline-actions";
import type { CandidateMatchWithCandidate } from "@/lib/jobs/ranking-schema";
import type { CandidateContact, ContactStatus } from "@/lib/jobs/contacts-schema";

interface FindCandidatesViewProps {
  jobId: string;
  hasJobDescription: boolean;
  initialMatches: CandidateMatchWithCandidate[];
  initialContacts: CandidateContact[];
}

type Status = "idle" | "running" | "ready" | "error";

// Exact copy required by AGENTS.md — cycled on a timer while the pipeline
// runs, since it's a single long-running server action rather than a
// step-by-step wizard.
const PHASES = [
  "Analyzing job description...",
  "Generating sourcing strategy...",
  "Searching public sources...",
  "Finding potential candidates...",
  "Removing duplicates...",
  "Finding public contact information...",
  "Analyzing candidate matches...",
  "Ranking candidates...",
];
const PHASE_INTERVAL_MS = 4000;

function scoreBadgeClass(score: number): string {
  if (score >= 80) return "bg-emerald-50 text-emerald-700";
  if (score >= 50) return "bg-amber-50 text-amber-800";
  return "bg-red-50 text-red-700";
}

// AGENTS.md requires literal "Not Publicly Found" copy; the stored enum
// value stays "Not Found" so it doesn't require a schema/data migration.
function displayStatus(status: ContactStatus | "Not Searched"): string {
  if (status === "Not Found" || status === "Not Searched") return "Not Publicly Found";
  return status;
}

function statusBadgeClass(status: ContactStatus | "Not Searched"): string {
  if (status === "Publicly Found") return "bg-emerald-50 text-emerald-700";
  if (status === "Possible" || status === "Not Verified") return "bg-amber-50 text-amber-800";
  return "bg-slate-100 text-slate-600";
}

function Spinner() {
  return (
    <svg className="h-8 w-8 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function FindCandidatesView({
  jobId,
  hasJobDescription,
  initialMatches,
  initialContacts,
}: FindCandidatesViewProps) {
  const [status, setStatus] = useState<Status>(initialMatches.length > 0 ? "ready" : "idle");
  const [matches, setMatches] = useState<CandidateMatchWithCandidate[]>(initialMatches);
  const [contactsByCandidateId, setContactsByCandidateId] = useState<Map<string, CandidateContact>>(
    () => new Map(initialContacts.map((c) => [c.candidate_id, c])),
  );
  const [error, setError] = useState<string | null>(null);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [copiedCandidateId, setCopiedCandidateId] = useState<string | null>(null);

  const [isRunning, startRunning] = useTransition();
  const phaseTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (phaseTimer.current) clearInterval(phaseTimer.current);
    };
  }, []);

  function runPipeline() {
    setStatus("running");
    setError(null);
    setPhaseIndex(0);

    phaseTimer.current = setInterval(() => {
      setPhaseIndex((prev) => Math.min(prev + 1, PHASES.length - 1));
    }, PHASE_INTERVAL_MS);

    startRunning(async () => {
      const result = await findCandidates(jobId);
      if (phaseTimer.current) clearInterval(phaseTimer.current);

      if (result.error || !result.data) {
        setStatus("error");
        setError(result.error ?? "Something went wrong. Please try again.");
        return;
      }

      setMatches(result.data.matches);
      setContactsByCandidateId(new Map(result.data.contacts.map((c) => [c.candidate_id, c])));
      setStatus("ready");
    });
  }

  async function handleCopyEmail(candidateId: string, email: string) {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedCandidateId(candidateId);
      setTimeout(() => setCopiedCandidateId((prev) => (prev === candidateId ? null : prev)), 1500);
    } catch {
      // Clipboard access can fail (permissions, insecure context); not worth surfacing.
    }
  }

  const hasResults = matches.length > 0;

  const sortedMatches = useMemo(
    () => [...matches].sort((a, b) => b.overall_score - a.overall_score),
    [matches],
  );

  if (!hasJobDescription) {
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Add a job description before finding candidates.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={runPipeline} isLoading={isRunning}>
          {hasResults ? "Re-run Search" : "Find Candidates"}
        </Button>
        {hasResults && !isRunning && (
          <span className="text-sm text-slate-500">
            {matches.length} candidate{matches.length === 1 ? "" : "s"} found
          </span>
        )}
      </div>

      {status === "running" && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 py-14 text-center">
          <Spinner />
          <p className="text-sm font-medium text-slate-700">{PHASES[phaseIndex]}</p>
        </div>
      )}

      {status === "error" && error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {status === "idle" && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
          Click &ldquo;Find Candidates&rdquo; to automatically search public sources, find
          contact information, and rank candidates against this job&apos;s requirements.
        </p>
      )}

      {hasResults && status !== "running" && (
        <div className="flex flex-col gap-4">
          {sortedMatches.map((match, index) => {
            const contact = contactsByCandidateId.get(match.candidate_id);
            const emailStatus = contact?.email_status ?? "Not Searched";
            const phoneStatus = contact?.phone_status ?? "Not Searched";
            const otherSourceUrl =
              contact?.source_url && contact.source_url !== match.candidate.profile_url
                ? contact.source_url
                : match.candidate.source_url && match.candidate.source_url !== match.candidate.profile_url
                  ? match.candidate.source_url
                  : null;

            return (
              <div
                key={match.id}
                className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      #{index + 1}
                    </p>
                    <p className="text-lg font-semibold text-slate-900">
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
                    {match.overall_score}% Match
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Matches
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
                      Unconfirmed
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

                <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Email</p>
                    <p className="mt-1 text-sm text-slate-900">{contact?.email ?? "Not Publicly Found"}</p>
                    <span
                      className={`mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(
                        emailStatus,
                      )}`}
                    >
                      Status: {displayStatus(emailStatus)}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Phone</p>
                    <p className="mt-1 text-sm text-slate-900">{contact?.phone ?? "Not Publicly Found"}</p>
                    <span
                      className={`mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(
                        phoneStatus,
                      )}`}
                    >
                      Status: {displayStatus(phoneStatus)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  {match.candidate.profile_url && (
                    <a
                      href={match.candidate.profile_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
                    >
                      View Profile
                    </a>
                  )}
                  {otherSourceUrl && (
                    <a
                      href={otherSourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
                    >
                      Other Source
                    </a>
                  )}
                  {contact?.email && (
                    <Button
                      type="button"
                      variant="outline"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => handleCopyEmail(match.candidate_id, contact.email!)}
                    >
                      {copiedCandidateId === match.candidate_id ? "Copied!" : "Copy Email"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t border-slate-100 pt-4">
        <Link
          href={`/search/${jobId}/analysis`}
          className="text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          Advanced: review or edit each step manually →
        </Link>
      </div>
    </div>
  );
}
