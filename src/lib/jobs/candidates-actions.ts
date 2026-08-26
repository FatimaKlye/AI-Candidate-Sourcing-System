"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { findDuplicateCandidate } from "@/lib/search/dedupe";
import { extractProfileInfo, ProfileFetchError } from "@/lib/search/profile-extract";
import {
  manualCandidateSchema,
  importCandidateSchema,
  type Candidate,
  type ExtractedProfileInfo,
} from "@/lib/jobs/candidates-schema";

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

export interface AddCandidateResult {
  data?: Candidate;
  error?: string;
}

interface NewCandidateFields {
  full_name: string;
  current_title: string;
  current_company: string;
  location: string;
  profile_url: string | null;
  source: string;
}

async function insertCandidate(
  supabase: SupabaseServerClient,
  jobId: string,
  userId: string,
  fields: NewCandidateFields,
): Promise<AddCandidateResult> {
  const { data: existing } = await supabase
    .from("candidates")
    .select("*")
    .eq("job_id", jobId)
    .eq("user_id", userId);

  const duplicate = findDuplicateCandidate(fields, (existing ?? []) as Candidate[]);
  if (duplicate) {
    return {
      error: `This looks like a duplicate of an existing candidate: ${duplicate.full_name} (${duplicate.current_title} at ${duplicate.current_company}).`,
    };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("candidates")
    .insert({
      job_id: jobId,
      user_id: userId,
      full_name: fields.full_name,
      current_title: fields.current_title,
      current_company: fields.current_company,
      location: fields.location,
      profile_url: fields.profile_url,
      source: fields.source,
      source_url: fields.profile_url,
      snippet: null,
    })
    .select()
    .single();

  if (insertError || !inserted) {
    return { error: "Could not save the candidate. Please try again." };
  }

  revalidatePath(`/search/${jobId}/candidates`);
  return { data: inserted as Candidate };
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

  return insertCandidate(supabase, jobId, user.id, {
    full_name: parsed.data.full_name,
    current_title: parsed.data.current_title,
    current_company: parsed.data.current_company,
    location: parsed.data.location,
    profile_url: parsed.data.profile_url,
    source: "Manual Entry",
  });
}

export interface ExtractCandidateResult {
  data?: ExtractedProfileInfo;
  error?: string;
}

/** Best-effort, free extraction from a public profile page — no manual entry required if it succeeds. */
export async function extractCandidateFromUrl(
  jobId: string,
  url: string,
): Promise<ExtractCandidateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to import a candidate." };
  }

  const ownedJobId = await getOwnedJobId(supabase, jobId, user.id);
  if (!ownedJobId) {
    return { error: "Job not found." };
  }

  try {
    const info = await extractProfileInfo(url);
    return { data: info };
  } catch (err) {
    if (err instanceof ProfileFetchError) {
      return { error: err.message };
    }
    return {
      error: "Could not automatically extract candidate details from this page. Please enter them manually.",
    };
  }
}

export async function importCandidate(
  jobId: string,
  input: unknown,
): Promise<AddCandidateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to import a candidate." };
  }

  const ownedJobId = await getOwnedJobId(supabase, jobId, user.id);
  if (!ownedJobId) {
    return { error: "Job not found." };
  }

  const parsed = importCandidateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid candidate details." };
  }

  return insertCandidate(supabase, jobId, user.id, {
    full_name: parsed.data.full_name,
    current_title: parsed.data.current_title,
    current_company: parsed.data.current_company,
    location: parsed.data.location,
    profile_url: parsed.data.profile_url,
    source: parsed.data.source !== "Not Found" ? parsed.data.source : "Imported Profile",
  });
}
