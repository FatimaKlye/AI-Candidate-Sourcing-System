import type { JobRequirements } from "@/lib/jobs/analysis-schema";
import {
  type AnalysisCategory,
  type AnalysisItem,
  type CandidateEvaluation,
  type RequirementComparison,
} from "@/lib/jobs/ranking-schema";

// Scoring weights per AGENTS.md — fixed and never produced by the AI itself.
const WEIGHTS = {
  must_have: 0.35,
  experience: 0.2,
  industry: 0.15,
  skills: 0.1,
  seniority: 0.1,
  location: 0.05,
  preferred: 0.05,
} as const;

function statusValue(status: RequirementComparison["status"]): number {
  if (status === "Match") return 1;
  if (status === "Partial") return 0.5;
  return 0;
}

// The AI is asked to repeat each requirement verbatim, but a local model can
// still drop or reword items. Reconcile against the actual JD list so every
// stated requirement is accounted for, defaulting missing ones to
// "Not Confirmed" rather than silently dropping them from the score.
function reconcileList(
  requirements: string[],
  aiItems: RequirementComparison[],
): RequirementComparison[] {
  const byRequirement = new Map(
    aiItems.map((item) => [item.requirement.trim().toLowerCase(), item]),
  );

  return requirements.map((requirement) => {
    const match = byRequirement.get(requirement.trim().toLowerCase());
    if (match) {
      return { requirement, status: match.status, evidence: match.evidence };
    }
    return {
      requirement,
      status: "Not Confirmed" as const,
      evidence: "No mention found in the available candidate information.",
    };
  });
}

function listScore(items: RequirementComparison[]): number {
  if (items.length === 0) return 100;
  const total = items.reduce((sum, item) => sum + statusValue(item.status), 0);
  return Math.round((total / items.length) * 100);
}

function singleScore(item: RequirementComparison): number {
  if (item.requirement === "Not Specified") return 100;
  return Math.round(statusValue(item.status) * 100);
}

function labelFor(category: AnalysisCategory, requirement: string): string {
  switch (category) {
    case "industry":
      return `${requirement} experience`;
    case "location":
      return `${requirement} based`;
    case "seniority":
      return `${requirement} seniority`;
    case "experience":
      return `${requirement} experience`;
    default:
      return requirement;
  }
}

export interface ScoredEvaluation {
  scores: {
    overall_score: number;
    must_have_score: number;
    experience_score: number;
    industry_score: number;
    skills_score: number;
    seniority_score: number;
    location_score: number;
    preferred_score: number;
  };
  strengths: string[];
  missing_requirements: string[];
  analysis: AnalysisItem[];
}

export function scoreEvaluation(
  requirements: JobRequirements,
  evaluation: CandidateEvaluation,
): ScoredEvaluation {
  const mustHave = reconcileList(requirements.must_have, evaluation.must_have);
  const preferred = reconcileList(requirements.preferred, evaluation.preferred);
  const skills = reconcileList(requirements.required_skills, evaluation.skills);
  const industry: RequirementComparison = {
    requirement: requirements.industry,
    status: evaluation.industry.status,
    evidence: evaluation.industry.evidence,
  };
  const seniority: RequirementComparison = {
    requirement: requirements.seniority,
    status: evaluation.seniority.status,
    evidence: evaluation.seniority.evidence,
  };
  const location: RequirementComparison = {
    requirement: requirements.location,
    status: evaluation.location.status,
    evidence: evaluation.location.evidence,
  };
  const experience: RequirementComparison = {
    requirement: requirements.minimum_experience,
    status: evaluation.experience.status,
    evidence: evaluation.experience.evidence,
  };

  const must_have_score = listScore(mustHave);
  const preferred_score = listScore(preferred);
  const skills_score = listScore(skills);
  const industry_score = singleScore(industry);
  const seniority_score = singleScore(seniority);
  const location_score = singleScore(location);
  const experience_score = singleScore(experience);

  const overall_score = Math.round(
    must_have_score * WEIGHTS.must_have +
      experience_score * WEIGHTS.experience +
      industry_score * WEIGHTS.industry +
      skills_score * WEIGHTS.skills +
      seniority_score * WEIGHTS.seniority +
      location_score * WEIGHTS.location +
      preferred_score * WEIGHTS.preferred,
  );

  const analysis: AnalysisItem[] = [
    ...mustHave.map((item) => ({ category: "must_have" as const, ...item })),
    ...preferred.map((item) => ({ category: "preferred" as const, ...item })),
    ...skills.map((item) => ({ category: "skills" as const, ...item })),
    { category: "industry" as const, ...industry },
    { category: "seniority" as const, ...seniority },
    { category: "location" as const, ...location },
    { category: "experience" as const, ...experience },
  ];

  const strengths: string[] = [];
  const missing_requirements: string[] = [];
  for (const item of analysis) {
    if (item.requirement === "Not Specified") continue;
    if (item.status === "Match") {
      strengths.push(labelFor(item.category, item.requirement));
    } else if (item.status === "Partial") {
      missing_requirements.push(`${labelFor(item.category, item.requirement)} not fully confirmed`);
    } else {
      missing_requirements.push(`${labelFor(item.category, item.requirement)} not confirmed`);
    }
  }

  return {
    scores: {
      overall_score,
      must_have_score,
      experience_score,
      industry_score,
      skills_score,
      seniority_score,
      location_score,
      preferred_score,
    },
    strengths: strengths.slice(0, 8),
    missing_requirements: missing_requirements.slice(0, 8),
    analysis,
  };
}
