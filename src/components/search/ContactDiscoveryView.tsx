"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { toggleShortlist } from "@/lib/jobs/ranking-actions";
import { findContactForCandidate, findContactsForShortlist } from "@/lib/jobs/contacts-actions";
import type { CandidateMatchWithCandidate } from "@/lib/jobs/ranking-schema";
import type { CandidateContact, ContactStatus } from "@/lib/jobs/contacts-schema";

interface ContactDiscoveryViewProps {
  jobId: string;
  initialMatches: CandidateMatchWithCandidate[];
  initialContacts: CandidateContact[];
}

function scoreBadgeClass(score: number): string {
  if (score >= 80) return "bg-emerald-50 text-emerald-700";
  if (score >= 50) return "bg-amber-50 text-amber-800";
  return "bg-red-50 text-red-700";
}

function statusBadgeClass(status: ContactStatus | "Not Searched"): string {
  if (status === "Publicly Found") return "bg-emerald-50 text-emerald-700";
  if (status === "Possible" || status === "Not Verified") return "bg-amber-50 text-amber-800";
  return "bg-slate-100 text-slate-600";
}

function overallStatus(contact: CandidateContact | undefined): ContactStatus | "Not Searched" {
  if (!contact) return "Not Searched";
  if (contact.email_status === "Publicly Found" || contact.phone_status === "Publicly Found") {
    return "Publicly Found";
  }
  if (contact.email_status === "Possible") return "Possible";
  return "Not Found";
}

function Spinner() {
  return (
    <svg className="h-8 w-8 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function ContactDiscoveryView({
  jobId,
  initialMatches,
  initialContacts,
}: ContactDiscoveryViewProps) {
  const router = useRouter();

  const [matches, setMatches] = useState<CandidateMatchWithCandidate[]>(initialMatches);
  const [contactsByCandidateId, setContactsByCandidateId] = useState<Map<string, CandidateContact>>(
    () => new Map(initialContacts.map((contact) => [contact.candidate_id, contact])),
  );
  const [pendingContactIds, setPendingContactIds] = useState<Set<string>>(new Set());
  const [pendingShortlistIds, setPendingShortlistIds] = useState<Set<string>>(new Set());
  const [copiedCandidateId, setCopiedCandidateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isFindingAll, startFindingAll] = useTransition();
  const [isContinuing, startContinuing] = useTransition();

  const shortlistedCount = useMemo(
    () => matches.filter((match) => match.shortlisted).length,
    [matches],
  );

  async function handleFindContact(match: CandidateMatchWithCandidate) {
    setError(null);
    setPendingContactIds((prev) => new Set(prev).add(match.id));

    const result = await findContactForCandidate(jobId, match.id);
    if (result.error) {
      setError(result.error);
    } else if (result.data) {
      setContactsByCandidateId((prev) => {
        const next = new Map(prev);
        next.set(result.data!.candidate_id, result.data!);
        return next;
      });
    }

    setPendingContactIds((prev) => {
      const next = new Set(prev);
      next.delete(match.id);
      return next;
    });
  }

  function handleFindAllForShortlist() {
    setError(null);
    startFindingAll(async () => {
      const result = await findContactsForShortlist(jobId);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.data) {
        setContactsByCandidateId((prev) => {
          const next = new Map(prev);
          for (const contact of result.data!) {
            next.set(contact.candidate_id, contact);
          }
          return next;
        });
      }
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

  async function handleCopyEmail(candidateId: string, email: string) {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedCandidateId(candidateId);
      setTimeout(() => {
        setCopiedCandidateId((prev) => (prev === candidateId ? null : prev));
      }, 1500);
    } catch {
      setError("Could not copy the email address. Please copy it manually.");
    }
  }

  function handleContinue() {
    startContinuing(async () => {
      router.push(`/search/${jobId}/ranking`);
    });
  }

  if (matches.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Rank candidates before searching for contact information.
        </p>
        <Link
          href={`/search/${jobId}/ranking`}
          className="inline-flex w-fit items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          Go to AI Ranking
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={handleFindAllForShortlist}
          isLoading={isFindingAll}
          disabled={shortlistedCount === 0}
        >
          Find Contacts for Shortlist
        </Button>
        {shortlistedCount === 0 && (
          <span className="text-sm text-slate-500">
            Add candidates to the shortlist to use this.
          </span>
        )}
      </div>

      {isFindingAll && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 py-10 text-center">
          <Spinner />
          <p className="text-sm font-medium text-slate-700">
            Searching public web sources for shortlisted candidates...
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {matches.map((match, index) => {
          const contact = contactsByCandidateId.get(match.candidate_id);
          const status = overallStatus(contact);
          const hasEmail = Boolean(contact?.email);

          return (
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
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${scoreBadgeClass(
                      match.overall_score,
                    )}`}
                  >
                    {match.overall_score}%
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass(
                      status,
                    )}`}
                  >
                    {status}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Work Email
                  </p>
                  <p className="mt-1 text-sm text-slate-900">{contact?.email ?? "Not Found"}</p>
                  {contact && (
                    <p className="text-xs text-slate-500">
                      Status: {contact.email_status}
                      {contact.email_status === "Possible" && " · Verification: Not Verified"}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Phone
                  </p>
                  <p className="mt-1 text-sm text-slate-900">{contact?.phone ?? "Not Found"}</p>
                  {contact && <p className="text-xs text-slate-500">Status: {contact.phone_status}</p>}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Contact Source
                </p>
                <p className="mt-1 text-sm text-slate-600">{contact?.source_name ?? "Not Found"}</p>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  className="px-3 py-1.5 text-xs"
                  isLoading={pendingContactIds.has(match.id)}
                  onClick={() => handleFindContact(match)}
                >
                  {contact ? "Refresh Contact" : "Find Contact"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="px-3 py-1.5 text-xs"
                  disabled={!hasEmail}
                  onClick={() => contact?.email && handleCopyEmail(match.candidate_id, contact.email)}
                >
                  {copiedCandidateId === match.candidate_id ? "Copied!" : "Copy Email"}
                </Button>
                {contact?.source_url ? (
                  <a
                    href={contact.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
                  >
                    Open Source
                  </a>
                ) : (
                  <Button type="button" variant="outline" className="px-3 py-1.5 text-xs" disabled>
                    Open Source
                  </Button>
                )}
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
            </div>
          );
        })}
      </div>

      <div className="border-t border-slate-100 pt-6">
        <Button
          type="button"
          onClick={handleContinue}
          isLoading={isContinuing}
          className="w-full sm:w-auto"
        >
          Continue to Shortlist
        </Button>
      </div>
    </div>
  );
}
