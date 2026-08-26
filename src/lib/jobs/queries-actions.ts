"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  generateSearchQueries,
  OllamaConnectionError,
  OllamaResponseError,
} from "@/lib/ai/ollama";
import type { JobRequirementsExtraction } from "@/lib/jobs/analysis-schema";
import type { GeneratedSearchQuery, SearchQuery } from "@/lib/jobs/queries-schema";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function getOwnedJobRequirements(
  supabase: SupabaseServerClient,
  jobId: string,
  userId: string,
): Promise<{ data?: JobRequirementsExtraction; error?: string }> {
  const { data: job } = await supabase
    .from("jobs")
    .select("id")
    .eq("id", jobId)
    .eq("user_id", userId)
    .single();

  if (!job) {
    return { error: "Job not found." };
  }

  const { data: requirements } = await supabase
    .from("job_requirements")
    .select("*")
    .eq("job_id", jobId)
    .maybeSingle();

  if (!requirements) {
    return {
      error: "Analyze the job description before generating search queries.",
    };
  }

  return { data: requirements as JobRequirementsExtraction };
}

export interface GenerateQueriesResult {
  data?: GeneratedSearchQuery[];
  error?: string;
}

export async function generateQueries(jobId: string): Promise<GenerateQueriesResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to generate search queries." };
  }

  const { data: requirements, error: reqError } = await getOwnedJobRequirements(
    supabase,
    jobId,
    user.id,
  );
  if (reqError || !requirements) {
    return { error: reqError ?? "Job requirements not found." };
  }

  try {
    const queries = await generateSearchQueries(requirements);
    return { data: queries };
  } catch (err) {
    if (err instanceof OllamaConnectionError || err instanceof OllamaResponseError) {
      return { error: err.message };
    }
    return {
      error: "Something went wrong while generating search queries. Please try again.",
    };
  }
}

export interface SaveSearchQueriesResult {
  data?: SearchQuery[];
  error?: string;
}

export async function saveSearchQueries(
  jobId: string,
  queries: GeneratedSearchQuery[],
): Promise<SaveSearchQueriesResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to save search queries." };
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("id")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .single();

  if (!job) {
    return { error: "Job not found." };
  }

  const cleaned = queries
    .map((query) => ({
      query_text: query.query_text.trim(),
      query_type: query.query_type.trim() || "General",
    }))
    .filter((query) => query.query_text.length > 0);

  if (cleaned.length === 0) {
    return { error: "Add at least one search query before saving." };
  }

  const { error: deleteError } = await supabase
    .from("search_queries")
    .delete()
    .eq("job_id", jobId)
    .eq("user_id", user.id);

  if (deleteError) {
    return { error: "Could not save the search strategy. Please try again." };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("search_queries")
    .insert(
      cleaned.map((query) => ({
        job_id: jobId,
        user_id: user.id,
        query_text: query.query_text,
        query_type: query.query_type,
      })),
    )
    .select();

  if (insertError || !inserted) {
    return { error: "Could not save the search strategy. Please try again." };
  }

  revalidatePath(`/search/${jobId}/queries`);
  return { data: inserted as SearchQuery[] };
}
