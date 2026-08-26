export interface ScoringRequirements {
  required_skills?: string[] | null;
  preferred?: string[] | null;
  minimum_experience?: string | null;
  location?: string | null;
  seniority?: string | null;
  version?: number | null;
}

export interface ScoringCandidate {
  skills?: string[] | null;
  years_experience?: number | null;
  location?: string | null;
  seniority?: string | null;
}

export interface MatchScore {
  overall_score: number;
  skills_score: number;
  must_have_score: number;
  experience_score: number;
  location_score: number;
  seniority_score: number;
  preferred_score: number;
  industry_score: number;
  matched_skills: string[];
  strengths: string[];
  missing_requirements: string[];
  explanation: string;
  score_breakdown: Record<string, { weight: number; score: number }>;
  requirements_version: number;
}

const DEFAULT_WEIGHTS = {
  required_skills: 45,
  experience: 25,
  location: 15,
  seniority: 10,
  preferred_skills: 5,
};

function normalized(value: string) {
  return value.trim().toLowerCase();
}

function overlapScore(required: string[], actual: string[]) {
  if (required.length === 0) return { score: 100, matched: [] as string[] };
  const actualSet = new Set(actual.map(normalized));
  const matched = required.filter((item) => actualSet.has(normalized(item)));
  return { score: Math.round((matched.length / required.length) * 100), matched };
}

function textScore(expected?: string | null, actual?: string | null) {
  if (!expected || normalized(expected) === "not specified") return 100;
  if (!actual) return 0;
  const left = normalized(expected);
  const right = normalized(actual);
  return left === right || left.includes(right) || right.includes(left) ? 100 : 0;
}

function minimumYears(value?: string | null) {
  const match = value?.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function calculateCandidateMatch(
  requirements: ScoringRequirements,
  candidate: ScoringCandidate,
  configuredWeights?: Record<string, number>,
): MatchScore {
  const weights = { ...DEFAULT_WEIGHTS, ...configuredWeights };
  const required = requirements.required_skills ?? [];
  const preferred = requirements.preferred ?? [];
  const actualSkills = candidate.skills ?? [];
  const requiredResult = overlapScore(required, actualSkills);
  const preferredResult = overlapScore(preferred, actualSkills);
  const minYears = minimumYears(requirements.minimum_experience);
  const experienceScore =
    minYears === null
      ? 100
      : Math.min(100, Math.round(((candidate.years_experience ?? 0) / minYears) * 100));
  const locationScore = textScore(requirements.location, candidate.location);
  const seniorityScore = textScore(requirements.seniority, candidate.seniority);

  const weighted =
    requiredResult.score * weights.required_skills +
    experienceScore * weights.experience +
    locationScore * weights.location +
    seniorityScore * weights.seniority +
    preferredResult.score * weights.preferred_skills;
  const weightTotal = Object.values(weights).reduce((sum, value) => sum + value, 0) || 100;
  const overall = Math.round(weighted / weightTotal);
  const matchedSet = new Set(requiredResult.matched.map(normalized));
  const missing = required.filter((skill) => !matchedSet.has(normalized(skill)));
  const strengths = [
    requiredResult.matched.length > 0
      ? `Matches ${requiredResult.matched.length} required skill${requiredResult.matched.length === 1 ? "" : "s"}`
      : null,
    experienceScore === 100 && minYears !== null ? "Meets the experience requirement" : null,
    locationScore === 100 && requirements.location !== "Not Specified" ? "Location aligns" : null,
    seniorityScore === 100 && requirements.seniority !== "Not Specified" ? "Seniority aligns" : null,
  ].filter((item): item is string => Boolean(item));

  return {
    overall_score: overall,
    skills_score: requiredResult.score,
    must_have_score: requiredResult.score,
    experience_score: experienceScore,
    location_score: locationScore,
    seniority_score: seniorityScore,
    preferred_score: preferredResult.score,
    industry_score: 0,
    matched_skills: requiredResult.matched,
    strengths,
    missing_requirements: missing,
    explanation: `This auditable score uses the approved weighting: required skills ${weights.required_skills}%, experience ${weights.experience}%, location ${weights.location}%, seniority ${weights.seniority}%, and preferred skills ${weights.preferred_skills}%. Human review is required before contact or hiring decisions.`,
    score_breakdown: {
      required_skills: { weight: weights.required_skills, score: requiredResult.score },
      experience: { weight: weights.experience, score: experienceScore },
      location: { weight: weights.location, score: locationScore },
      seniority: { weight: weights.seniority, score: seniorityScore },
      preferred_skills: { weight: weights.preferred_skills, score: preferredResult.score },
    },
    requirements_version: requirements.version ?? 1,
  };
}
