"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  evaluateCandidateAgainstRequirements,
  OllamaConnectionError,
  OllamaResponseError,
} from "@/lib/ai/ollama";
import type { JobRequirements } from "@/lib/jobs/analysis-schema";
import type { Candidate } from "@/lib/jobs/candidates-schema";
import {
  type AnalysisCategory,
  type AnalysisItem,
  type CandidateMatchWithCandidate,
  type RequirementComparison,
} from "@/lib/jobs/ranking-schema";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

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

async function getOwnedJobId(
  supabase: SupabaseServerClient,
  jobId: string,
  userId: string,
): Promise<string | null> {
  const { data: job } = await supabase
    .from("jobs")
    .select("id")
    .eq("id", jobId)
    .eq("user_id", userId)
    .single();

  return job?.id ?? null;
}

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

interface ScoredEvaluation {
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

function scoreEvaluation(
  requirements: JobRequirements,
  evaluation: {
    must_have: RequirementComparison[];
    preferred: RequirementComparison[];
    skills: RequirementComparison[];
    industry: RequirementComparison;
    seniority: RequirementComparison;
    location: RequirementComparison;
    experience: RequirementComparison;
  },
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

async function fetchMatchesWithCandidates(
  supabase: SupabaseServerClient,
  jobId: string,
  userId: string,
): Promise<CandidateMatchWithCandidate[]> {
  const { data: matches } = await supabase
    .from("candidate_matches")
    .select("*, candidate:candidates(*)")
    .eq("job_id", jobId)
    .eq("user_id", userId)
    .order("overall_score", { ascending: false });

  return (matches ?? []) as unknown as CandidateMatchWithCandidate[];
}

export interface CalculateRankingResult {
  data?: CandidateMatchWithCandidate[];
  error?: string;
}

export async function calculateRanking(jobId: string): Promise<CalculateRankingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to rank candidates." };
  }

  const ownedJobId = await getOwnedJobId(supabase, jobId, user.id);
  if (!ownedJobId) {
    return { error: "Job not found." };
  }

  const { data: requirements } = await supabase
    .from("job_requirements")
    .select("*")
    .eq("job_id", jobId)
    .maybeSingle();

  if (!requirements) {
    return { error: "Analyze the job description before ranking candidates." };
  }

  const { data: candidates } = await supabase
    .from("candidates")
    .select("*")
    .eq("job_id", jobId)
    .eq("user_id", user.id);

  if (!candidates || candidates.length === 0) {
    return { error: "No candidates to rank yet. Discover candidates first." };
  }

  const { data: existingMatches } = await supabase
    .from("candidate_matches")
    .select("candidate_id, shortlisted")
    .eq("job_id", jobId)
    .eq("user_id", user.id);

  const shortlistedByCandidateId = new Map(
    (existingMatches ?? []).map((match) => [match.candidate_id as string, match.shortlisted as boolean]),
  );

  const rows: Array<{
    job_id: string;
    candidate_id: string;
    user_id: string;
    shortlisted: boolean;
  } & ScoredEvaluation["scores"] &
    Pick<ScoredEvaluation, "strengths" | "missing_requirements" | "analysis">> = [];

  for (const candidate of candidates as Candidate[]) {
    let evaluation;
    try {
      evaluation = await evaluateCandidateAgainstRequirements(requirements as JobRequirements, {
        full_name: candidate.full_name,
        current_title: candidate.current_title,
        current_company: candidate.current_company,
        location: candidate.location,
        snippet: candidate.snippet,
      });
    } catch (err) {
      if (err instanceof OllamaConnectionError || err instanceof OllamaResponseError) {
        return { error: err.message };
      }
      return {
        error: "Something went wrong while analyzing candidates. Please try again.",
      };
    }

    const scored = scoreEvaluation(requirements as JobRequirements, evaluation);

    rows.push({
      job_id: jobId,
      candidate_id: candidate.id,
      user_id: user.id,
      shortlisted: shortlistedByCandidateId.get(candidate.id) ?? false,
      ...scored.scores,
      strengths: scored.strengths,
      missing_requirements: scored.missing_requirements,
      analysis: scored.analysis,
    });
  }

  const { error: upsertError } = await supabase
    .from("candidate_matches")
    .upsert(rows, { onConflict: "job_id,candidate_id" });

  if (upsertError) {
    return { error: "Ranking completed, but we couldn't save the results. Please try again." };
  }

  revalidatePath(`/search/${jobId}/ranking`);

  return { data: await fetchMatchesWithCandidates(supabase, jobId, user.id) };
}

export interface ToggleShortlistResult {
  error?: string;
}

export async function toggleShortlist(
  jobId: string,
  matchId: string,
  shortlisted: boolean,
): Promise<ToggleShortlistResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to update the shortlist." };
  }

  const { error } = await supabase
    .from("candidate_matches")
    .update({ shortlisted })
    .eq("id", matchId)
    .eq("user_id", user.id);

  if (error) {
    return { error: "Could not update the shortlist. Please try again." };
  }

  revalidatePath(`/search/${jobId}/ranking`);
  return {};
}
