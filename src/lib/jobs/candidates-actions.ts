"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runSearchPipeline } from "@/lib/search/candidate-pipeline";
import { dedupeCandidates, isDuplicateOfExisting } from "@/lib/search/dedupe";
import { GoogleSearchConfigError, GoogleSearchRequestError } from "@/lib/search/google";
import { OllamaConnectionError, OllamaResponseError } from "@/lib/ai/ollama";
import { manualCandidateSchema, type Candidate } from "@/lib/jobs/candidates-schema";

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

export interface CandidateSearchStats {
  searchesCompleted: number;
  totalSearches: number;
  possibleCandidatesFound: number;
  uniqueCandidatesFound: number;
}

export interface RunCandidateSearchResult {
  data?: { candidates: Candidate[]; stats: CandidateSearchStats };
  error?: string;
}

export async function runCandidateSearch(jobId: string): Promise<RunCandidateSearchResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to search for candidates." };
  }

  const ownedJobId = await getOwnedJobId(supabase, jobId, user.id);
  if (!ownedJobId) {
    return { error: "Job not found." };
  }

  const { data: queries } = await supabase
    .from("search_queries")
    .select("query_text")
    .eq("job_id", jobId)
    .eq("user_id", user.id);

  if (!queries || queries.length === 0) {
    return { error: "Save a search strategy before running candidate search." };
  }

  const { data: existing } = await supabase
    .from("candidates")
    .select("*")
    .eq("job_id", jobId)
    .eq("user_id", user.id);

  const existingCandidates = (existing ?? []) as Candidate[];

  let pipelineResult;
  try {
    pipelineResult = await runSearchPipeline(queries.map((q) => q.query_text));
  } catch (err) {
    if (err instanceof GoogleSearchConfigError || err instanceof GoogleSearchRequestError) {
      return { error: err.message };
    }
    if (err instanceof OllamaConnectionError || err instanceof OllamaResponseError) {
      return { error: err.message };
    }
    return {
      error: "Something went wrong while searching for candidates. Please try again.",
    };
  }

  const deduped = dedupeCandidates(pipelineResult.candidates);
  const newCandidates = deduped.filter(
    (candidate) => !isDuplicateOfExisting(candidate, existingCandidates),
  );

  if (newCandidates.length > 0) {
    const { error: insertError } = await supabase.from("candidates").insert(
      newCandidates.map((candidate) => ({
        job_id: jobId,
        user_id: user.id,
        full_name: candidate.full_name,
        current_title: candidate.current_title,
        current_company: candidate.current_company,
        location: candidate.location,
        profile_url: candidate.profile_url,
        source: candidate.source,
        source_url: candidate.source_url,
        snippet: candidate.snippet,
      })),
    );

    if (insertError) {
      return { error: "Found candidates but could not save them. Please try again." };
    }
  }

  const { data: allCandidates } = await supabase
    .from("candidates")
    .select("*")
    .eq("job_id", jobId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  revalidatePath(`/search/${jobId}/candidates`);

  return {
    data: {
      candidates: (allCandidates ?? []) as Candidate[],
      stats: {
        searchesCompleted: pipelineResult.searchesCompleted,
        totalSearches: queries.length,
        possibleCandidatesFound: pipelineResult.possibleCandidatesFound,
        uniqueCandidatesFound: (allCandidates ?? []).length,
      },
    },
  };
}

export interface AddCandidateResult {
  data?: Candidate;
  error?: string;
}

export async function addCandidateManually(
  jobId: string,
  input: unknown,
): Promise<AddCandidateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to add a candidate." };
  }

  const ownedJobId = await getOwnedJobId(supabase, jobId, user.id);
  if (!ownedJobId) {
    return { error: "Job not found." };
  }

  const parsed = manualCandidateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid candidate details." };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("candidates")
    .insert({
      job_id: jobId,
      user_id: user.id,
      full_name: parsed.data.full_name,
      current_title: parsed.data.current_title,
      current_company: parsed.data.current_company,
      location: parsed.data.location,
      profile_url: parsed.data.profile_url,
      source: "Manual Entry",
      source_url: parsed.data.profile_url,
      snippet: null,
    })
    .select()
    .single();

  if (insertError || !inserted) {
    return { error: "Could not add the candidate. Please try again." };
  }

  revalidatePath(`/search/${jobId}/candidates`);
  return { data: inserted as Candidate };
}
