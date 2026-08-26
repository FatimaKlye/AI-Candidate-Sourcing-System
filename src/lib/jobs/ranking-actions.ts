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
import { scoreEvaluation, type ScoredEvaluation } from "@/lib/jobs/scoring";
import { type CandidateMatchWithCandidate } from "@/lib/jobs/ranking-schema";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

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
