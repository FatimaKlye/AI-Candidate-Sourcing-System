import type { JobRequirementsExtraction } from "@/lib/jobs/analysis-schema";
import type { CandidateEvaluation, RequirementComparison } from "@/lib/jobs/ranking-schema";

// Deterministic replacement for the old per-candidate Ollama ranking call.
// Candidates only carry unstructured text (title, company, location,
// snippet — see candidates-schema.ts), so "matching" a requirement means
// phrase/keyword matching against that text rather than clean field
// comparison. No network calls; safe to run for every candidate.

const NOT_FOUND_EVIDENCE = "No mention found in the available candidate information.";

const STOPWORDS = new Set([
  "and", "the", "for", "with", "from", "that", "this", "are", "was", "were",
  "have", "has", "had", "must", "will", "etc", "plus", "years", "year",
  "including", "such", "who", "you", "your", "our", "their", "able",
]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantTokens(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function findExcerpt(source: string, phrase: string): string | null {
  const idx = source.toLowerCase().indexOf(phrase.toLowerCase());
  if (idx === -1) return null;
  const start = Math.max(0, idx - 25);
  const end = Math.min(source.length, idx + phrase.length + 25);
  const excerpt = source.slice(start, end).trim();
  return `${start > 0 ? "…" : ""}${excerpt}${end < source.length ? "…" : ""}`;
}

interface CandidateTextBlob {
  full: string;
  fullNormalized: string;
  location: string;
}

function matchAgainstBlob(requirement: string, blob: CandidateTextBlob): RequirementComparison {
  if (!requirement || requirement === "Not Specified") {
    return { requirement, status: "Not Confirmed", evidence: NOT_FOUND_EVIDENCE };
  }

  const reqNormalized = normalize(requirement);
  if (reqNormalized.length === 0) {
    return { requirement, status: "Not Confirmed", evidence: NOT_FOUND_EVIDENCE };
  }

  if (blob.fullNormalized.includes(reqNormalized)) {
    const excerpt = findExcerpt(blob.full, requirement) ?? requirement;
    return { requirement, status: "Match", evidence: excerpt };
  }

  const tokens = significantTokens(requirement);
  if (tokens.length === 0) {
    return { requirement, status: "Not Confirmed", evidence: NOT_FOUND_EVIDENCE };
  }

  const matchedTokens = tokens.filter((token) => blob.fullNormalized.includes(token));
  const ratio = matchedTokens.length / tokens.length;

  if (ratio >= 1) {
    const excerpt = findExcerpt(blob.full, matchedTokens[0]);
    return {
      requirement,
      status: "Match",
      evidence: excerpt ?? `Found: ${matchedTokens.join(", ")}`,
    };
  }
  if (ratio >= 0.5) {
    return { requirement, status: "Partial", evidence: `Partially found: ${matchedTokens.join(", ")}` };
  }

  return { requirement, status: "Not Confirmed", evidence: NOT_FOUND_EVIDENCE };
}

function matchLocation(requirement: string, blob: CandidateTextBlob): RequirementComparison {
  if (!requirement || requirement === "Not Specified") {
    return { requirement, status: "Not Confirmed", evidence: NOT_FOUND_EVIDENCE };
  }

  const reqNormalized = normalize(requirement);
  const locationNormalized = normalize(blob.location);

  if (locationNormalized.length > 0 && locationNormalized !== "not found") {
    if (locationNormalized.includes(reqNormalized) || reqNormalized.includes(locationNormalized)) {
      return { requirement, status: "Match", evidence: blob.location };
    }
    const tokens = significantTokens(requirement);
    const matched = tokens.filter((token) => locationNormalized.includes(token));
    if (tokens.length > 0 && matched.length / tokens.length >= 0.5) {
      return { requirement, status: "Partial", evidence: blob.location };
    }
  }

  // Fall back to scanning the full profile text (snippet may mention
  // location even when the extracted location field didn't).
  return matchAgainstBlob(requirement, blob);
}

export interface DeterministicEvaluationInput {
  current_title: string;
  current_company: string;
  location: string;
  snippet: string | null;
}

export function evaluateCandidateDeterministically(
  requirements: JobRequirementsExtraction,
  candidate: DeterministicEvaluationInput,
): CandidateEvaluation {
  const full = [candidate.current_title, candidate.current_company, candidate.location, candidate.snippet ?? ""]
    .filter(Boolean)
    .join(" | ");
  const blob: CandidateTextBlob = {
    full,
    fullNormalized: normalize(full),
    location: candidate.location,
  };

  return {
    must_have: requirements.must_have.map((requirement) => matchAgainstBlob(requirement, blob)),
    preferred: requirements.preferred.map((requirement) => matchAgainstBlob(requirement, blob)),
    skills: requirements.required_skills.map((requirement) => matchAgainstBlob(requirement, blob)),
    industry: matchAgainstBlob(requirements.industry, blob),
    seniority: matchAgainstBlob(requirements.seniority, blob),
    location: matchLocation(requirements.location, blob),
    experience: matchAgainstBlob(requirements.minimum_experience, blob),
  };
}
