import type { Candidate } from "@/lib/jobs/candidates-schema";

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname}`
      .replace(/\/$/, "")
      .toLowerCase();
  } catch {
    return normalize(url);
  }
}

interface CandidateIdentity {
  full_name: string;
  current_title: string;
  current_company: string;
  profile_url: string | null;
}

/**
 * Finds an existing candidate that looks like the same person, matched by
 * profile URL, or by full name + company + job title all matching.
 */
export function findDuplicateCandidate(
  candidate: CandidateIdentity,
  existing: Candidate[],
): Candidate | null {
  const urlKey = normalizeUrl(candidate.profile_url);
  if (urlKey) {
    const urlMatch = existing.find((row) => normalizeUrl(row.profile_url) === urlKey);
    if (urlMatch) return urlMatch;
  }

  const nameKey = normalize(candidate.full_name);
  const companyKey = normalize(candidate.current_company);
  const titleKey = normalize(candidate.current_title);

  return (
    existing.find(
      (row) =>
        normalize(row.full_name) === nameKey &&
        normalize(row.current_company) === companyKey &&
        normalize(row.current_title) === titleKey,
    ) ?? null
  );
}
