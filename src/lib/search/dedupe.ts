import type { DiscoveredCandidate } from "./types";
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

function identityKey(candidate: {
  full_name: string;
  current_company: string;
}): string {
  return `${normalize(candidate.full_name)}|${normalize(candidate.current_company)}`;
}

function filledFieldCount(candidate: DiscoveredCandidate): number {
  return [candidate.current_title, candidate.current_company, candidate.location].filter(
    (value) => value !== "Not Found",
  ).length;
}

/**
 * Merges candidates that refer to the same person — matched by profile URL,
 * or by name + company — keeping whichever duplicate has the most complete
 * information.
 */
export function dedupeCandidates(
  candidates: DiscoveredCandidate[],
): DiscoveredCandidate[] {
  const byKey = new Map<string, DiscoveredCandidate>();
  const identityToKey = new Map<string, string>();

  for (const candidate of candidates) {
    if (!candidate.full_name || candidate.full_name === "Not Found") continue;

    const urlKey = normalizeUrl(candidate.profile_url);
    const idKey = identityKey(candidate);
    const key = urlKey ?? identityToKey.get(idKey) ?? `name:${idKey}`;

    const existing = byKey.get(key);
    if (!existing || filledFieldCount(candidate) > filledFieldCount(existing)) {
      byKey.set(key, candidate);
    }
    identityToKey.set(idKey, key);
  }

  return Array.from(byKey.values());
}

/** True if `candidate` matches a candidate already saved for this job. */
export function isDuplicateOfExisting(
  candidate: DiscoveredCandidate,
  existing: Candidate[],
): boolean {
  const urlKey = normalizeUrl(candidate.profile_url);
  const idKey = identityKey(candidate);

  return existing.some((row) => {
    const rowUrlKey = normalizeUrl(row.profile_url);
    if (urlKey && rowUrlKey && urlKey === rowUrlKey) return true;
    return (
      identityKey({ full_name: row.full_name, current_company: row.current_company }) ===
      idKey
    );
  });
}
