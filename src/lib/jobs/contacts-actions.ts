"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { findPublicContact } from "@/lib/search/contact-search";
import { GoogleSearchConfigError } from "@/lib/search/google";
import type { CandidateContact } from "@/lib/jobs/contacts-schema";
import type { CandidateMatchWithCandidate } from "@/lib/jobs/ranking-schema";
import type { Candidate } from "@/lib/jobs/candidates-schema";

// What saveContact() actually needs to look someone up — a candidate ID plus
// the identifying fields, not a full ranked match. Lets the automated
// find-candidates pipeline call this before ranking exists, while a
// CandidateMatchWithCandidate (used by the manual contact-discovery page)
// still satisfies this shape structurally.
export interface ContactLookupTarget {
  candidate_id: string;
  candidate: Pick<Candidate, "full_name" | "current_title" | "current_company">;
}

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

async function fetchMatchById(
  supabase: SupabaseServerClient,
  jobId: string,
  matchId: string,
  userId: string,
): Promise<CandidateMatchWithCandidate | null> {
  const { data } = await supabase
    .from("candidate_matches")
    .select("*, candidate:candidates(*)")
    .eq("id", matchId)
    .eq("job_id", jobId)
    .eq("user_id", userId)
    .single();

  return (data as unknown as CandidateMatchWithCandidate) ?? null;
}

async function fetchShortlistedMatches(
  supabase: SupabaseServerClient,
  jobId: string,
  userId: string,
): Promise<CandidateMatchWithCandidate[]> {
  const { data } = await supabase
    .from("candidate_matches")
    .select("*, candidate:candidates(*)")
    .eq("job_id", jobId)
    .eq("user_id", userId)
    .eq("shortlisted", true)
    .order("overall_score", { ascending: false });

  return (data ?? []) as unknown as CandidateMatchWithCandidate[];
}

export async function saveContact(
  supabase: SupabaseServerClient,
  jobId: string,
  userId: string,
  target: ContactLookupTarget,
): Promise<CandidateContact | null> {
  const result = await findPublicContact({
    fullName: target.candidate.full_name,
    currentTitle: target.candidate.current_title,
    currentCompany: target.candidate.current_company,
  });

  const { data: saved } = await supabase
    .from("candidate_contacts")
    .upsert(
      {
        candidate_id: target.candidate_id,
        job_id: jobId,
        user_id: userId,
        email: result.email,
        email_status: result.emailStatus,
        phone: result.phone,
        phone_status: result.phoneStatus,
        source_name: result.sourceName,
        source_url: result.sourceUrl,
        confidence: result.confidence,
      },
      { onConflict: "job_id,candidate_id" },
    )
    .select()
    .single();

  return (saved as CandidateContact) ?? null;
}

export interface FindContactResult {
  data?: CandidateContact;
  error?: string;
}

export async function findContactForCandidate(
  jobId: string,
  matchId: string,
): Promise<FindContactResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to search for contacts." };
  }

  const ownedJobId = await getOwnedJobId(supabase, jobId, user.id);
  if (!ownedJobId) {
    return { error: "Job not found." };
  }

  const match = await fetchMatchById(supabase, jobId, matchId, user.id);
  if (!match) {
    return { error: "Candidate not found." };
  }

  let saved: CandidateContact | null;
  try {
    saved = await saveContact(supabase, jobId, user.id, match);
  } catch (err) {
    if (err instanceof GoogleSearchConfigError) {
      return { error: err.message };
    }
    return { error: "Something went wrong while searching for contact info. Please try again." };
  }

  if (!saved) {
    return { error: "Contact search completed, but we couldn't save the results. Please try again." };
  }

  revalidatePath(`/search/${jobId}/contact-discovery`);
  return { data: saved };
}

export interface FindContactsForShortlistResult {
  data?: CandidateContact[];
  error?: string;
}

export async function findContactsForShortlist(
  jobId: string,
): Promise<FindContactsForShortlistResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to search for contacts." };
  }

  const ownedJobId = await getOwnedJobId(supabase, jobId, user.id);
  if (!ownedJobId) {
    return { error: "Job not found." };
  }

  const shortlisted = await fetchShortlistedMatches(supabase, jobId, user.id);
  if (shortlisted.length === 0) {
    return { error: "Add candidates to the shortlist before finding contacts for them." };
  }

  const saved: CandidateContact[] = [];
  for (const match of shortlisted) {
    try {
      const contact = await saveContact(supabase, jobId, user.id, match);
      if (contact) saved.push(contact);
    } catch (err) {
      if (err instanceof GoogleSearchConfigError) {
        return { error: err.message };
      }
      // A single candidate's lookup failing shouldn't abort the rest of
      // the shortlist run.
    }
  }

  revalidatePath(`/search/${jobId}/contact-discovery`);
  return { data: saved };
}
