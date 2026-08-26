"use server";

// The automated "Find Candidates" pipeline (AGENTS.md): one action that
// takes a saved job description all the way to a ranked candidate list —
// analyze JD, generate search queries, search the public web, extract
// candidates, dedupe, find public contact info, and score/rank against the
// job requirements. No manual searching or per-candidate data entry.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  extractCandidatesFromSearchResults,
  evaluateCandidateAgainstRequirements,
  generateSearchQueries,
  OllamaConnectionError,
  OllamaResponseError,
} from "@/lib/ai/ollama";
import { runAnalysisAndSave } from "@/lib/jobs/analysis-actions";
import { insertCandidatesBulk } from "@/lib/jobs/candidates-actions";
import { saveContact } from "@/lib/jobs/contacts-actions";
import { scoreEvaluation } from "@/lib/jobs/scoring";
import { searchWeb, GoogleSearchConfigError, type WebSearchResult } from "@/lib/search/google";
import type { Candidate, ExtractedSearchCandidate } from "@/lib/jobs/candidates-schema";
import type { GeneratedSearchQuery } from "@/lib/jobs/queries-schema";
import type { CandidateContact } from "@/lib/jobs/contacts-schema";
import type { CandidateMatchWithCandidate } from "@/lib/jobs/ranking-schema";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Keeps one click well under Google's free 100-queries/day Custom Search
// quota: ~8 sourcing queries + up to ~3 contact-lookup queries per candidate.
const MAX_QUERIES_PER_RUN = 8;
const MAX_CANDIDATES_TO_PROCESS = 20;
const RESULTS_PER_QUERY = 8;
const EXTRACTION_BATCH_SIZE = 15;

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

function normalizeLink(link: string): string {
  try {
    const parsed = new URL(link);
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname}`.replace(/\/$/, "").toLowerCase();
  } catch {
    return link.toLowerCase();
  }
}

async function saveSearchQueriesForPipeline(
  supabase: SupabaseServerClient,
  jobId: string,
  userId: string,
  queries: GeneratedSearchQuery[],
): Promise<void> {
  await supabase.from("search_queries").delete().eq("job_id", jobId).eq("user_id", userId);
  await supabase.from("search_queries").insert(
    queries.map((query) => ({
      job_id: jobId,
      user_id: userId,
      query_text: query.query_text,
      query_type: query.query_type,
    })),
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export interface FindCandidatesResult {
  data?: {
    matches: CandidateMatchWithCandidate[];
    contacts: CandidateContact[];
  };
  error?: string;
}

export async function findCandidates(jobId: string): Promise<FindCandidatesResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to find candidates." };
  }

  const ownedJobId = await getOwnedJobId(supabase, jobId, user.id);
  if (!ownedJobId) {
    return { error: "Job not found." };
  }

  // 1. AI reads the JD and extracts hiring requirements.
  const analysisResult = await runAnalysisAndSave(supabase, jobId, user.id);
  if (analysisResult.error || !analysisResult.data) {
    return { error: analysisResult.error ?? "Could not analyze the job description." };
  }
  const requirements = analysisResult.data;

  // 2. Generate a sourcing strategy (search queries) from those requirements.
  let generatedQueries: GeneratedSearchQuery[];
  try {
    generatedQueries = await generateSearchQueries(requirements);
  } catch (err) {
    if (err instanceof OllamaConnectionError || err instanceof OllamaResponseError) {
      return { error: err.message };
    }
    return { error: "Something went wrong while generating search queries. Please try again." };
  }
  await saveSearchQueriesForPipeline(supabase, jobId, user.id, generatedQueries);

  // 3. Automatically search public sources for candidates.
  const queriesToRun = generatedQueries.slice(0, MAX_QUERIES_PER_RUN);
  const seenLinks = new Set<string>();
  const uniqueResults: WebSearchResult[] = [];

  for (const query of queriesToRun) {
    let results: WebSearchResult[];
    try {
      results = await searchWeb(query.query_text, RESULTS_PER_QUERY);
    } catch (err) {
      if (err instanceof GoogleSearchConfigError) {
        return { error: err.message };
      }
      continue;
    }

    for (const result of results) {
      const key = normalizeLink(result.link);
      if (seenLinks.has(key)) continue;
      seenLinks.add(key);
      uniqueResults.push(result);
    }
  }

  if (uniqueResults.length === 0) {
    return {
      error:
        "No public search results were found for this role. Try broadening the job description or search again later.",
    };
  }

  // 4. AI extracts candidate profiles from the raw search results.
  const extracted: ExtractedSearchCandidate[] = [];
  for (const batch of chunk(uniqueResults, EXTRACTION_BATCH_SIZE)) {
    try {
      const batchCandidates = await extractCandidatesFromSearchResults(requirements, batch);
      extracted.push(...batchCandidates);
    } catch (err) {
      if (err instanceof OllamaConnectionError) {
        return { error: err.message };
      }
      // A single batch failing to parse shouldn't abort the whole run.
    }
  }

  // 5. Remove duplicate candidates (against existing rows and within the batch).
  const resultsByLink = new Map(uniqueResults.map((r) => [r.link, r]));
  await insertCandidatesBulk(
    supabase,
    jobId,
    user.id,
    extracted.map((candidate) => ({
      full_name: candidate.full_name,
      current_title: candidate.current_title,
      current_company: candidate.current_company,
      location: candidate.location,
      profile_url: candidate.profile_url || null,
      source: candidate.source,
      snippet: resultsByLink.get(candidate.profile_url)?.snippet ?? null,
    })),
  );

  const { data: allCandidates } = await supabase
    .from("candidates")
    .select("*")
    .eq("job_id", jobId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const candidatesToProcess = ((allCandidates ?? []) as Candidate[]).slice(
    0,
    MAX_CANDIDATES_TO_PROCESS,
  );

  if (candidatesToProcess.length === 0) {
    return {
      error:
        "The AI could not confidently identify any individual candidates from the public search results. Try again or broaden the job description.",
    };
  }

  // 6. Find publicly available contact info for each candidate.
  const contacts: CandidateContact[] = [];
  for (const candidate of candidatesToProcess) {
    try {
      const contact = await saveContact(supabase, jobId, user.id, {
        candidate_id: candidate.id,
        candidate,
      });
      if (contact) contacts.push(contact);
    } catch (err) {
      if (err instanceof GoogleSearchConfigError) {
        return { error: err.message };
      }
      // A single candidate's contact lookup failing shouldn't abort the run.
    }
  }

  // 7. AI compares every candidate against the JD and ranks best → lowest.
  const rows: Array<{
    job_id: string;
    candidate_id: string;
    user_id: string;
    shortlisted: boolean;
  } & ReturnType<typeof scoreEvaluation>["scores"] &
    Pick<ReturnType<typeof scoreEvaluation>, "strengths" | "missing_requirements" | "analysis">> =
    [];

  const { data: existingMatches } = await supabase
    .from("candidate_matches")
    .select("candidate_id, shortlisted")
    .eq("job_id", jobId)
    .eq("user_id", user.id);
  const shortlistedByCandidateId = new Map(
    (existingMatches ?? []).map((m) => [m.candidate_id as string, m.shortlisted as boolean]),
  );

  for (const candidate of candidatesToProcess) {
    let evaluation;
    try {
      evaluation = await evaluateCandidateAgainstRequirements(requirements, {
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
      continue;
    }

    const scored = scoreEvaluation(requirements, evaluation);
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

  if (rows.length === 0) {
    return { error: "Something went wrong while ranking candidates. Please try again." };
  }

  await supabase.from("candidate_matches").upsert(rows, { onConflict: "job_id,candidate_id" });
  await supabase.from("jobs").update({ status: "completed" }).eq("id", jobId).eq("user_id", user.id);

  const { data: finalMatches } = await supabase
    .from("candidate_matches")
    .select("*, candidate:candidates(*)")
    .eq("job_id", jobId)
    .eq("user_id", user.id)
    .order("overall_score", { ascending: false });

  const { data: finalContacts } = await supabase
    .from("candidate_contacts")
    .select("*")
    .eq("job_id", jobId)
    .eq("user_id", user.id);

  revalidatePath(`/search/${jobId}/results`);
  revalidatePath(`/search/${jobId}`);

  return {
    data: {
      matches: (finalMatches ?? []) as unknown as CandidateMatchWithCandidate[],
      contacts: (finalContacts ?? []) as CandidateContact[],
    },
  };
}
