import { z } from "zod";

export interface Candidate {
  id: string;
  job_id: string;
  user_id: string;
  full_name: string;
  current_title: string;
  current_company: string;
  location: string;
  profile_url: string | null;
  source: string;
  source_url: string | null;
  snippet: string | null;
  created_at: string;
}

const optionalTextField = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : "Not Found"));

export const manualCandidateSchema = z.object({
  full_name: z.string().trim().min(1, "Full name is required."),
  current_title: optionalTextField,
  current_company: optionalTextField,
  location: optionalTextField,
  profile_url: z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? value : null))
    .refine((value) => value === null || /^https?:\/\//i.test(value), {
      message: "Profile URL must start with http:// or https://",
    }),
});

export type ManualCandidateInput = z.infer<typeof manualCandidateSchema>;

export const importCandidateSchema = z.object({
  profile_url: z
    .string()
    .trim()
    .min(1, "Profile URL is required.")
    .refine((value) => /^https?:\/\//i.test(value), {
      message: "Profile URL must start with http:// or https://",
    }),
  full_name: z.string().trim().min(1, "Full name is required."),
  current_title: optionalTextField,
  current_company: optionalTextField,
  location: optionalTextField,
  source: optionalTextField,
});

export type ImportCandidateInput = z.infer<typeof importCandidateSchema>;

// Best-effort fields read from a public profile page's HTML (title/meta
// tags) before the recruiter reviews and saves them — see profile-extract.ts.
export interface ExtractedProfileInfo {
  full_name: string;
  current_title: string;
  current_company: string;
  location: string;
  source: string;
}

// A candidate the AI extracted from a batch of public web search results —
// see extractCandidatesFromSearchResults() in ai/ollama.ts. profile_url is
// validated against the input batch's links after parsing (never trusted as
// AI-generated), so this is never invented outright, only mis-attributed at
// worst.
export const extractedSearchCandidateSchema = z.object({
  full_name: z.string().trim().min(1).catch(""),
  current_title: z.string().trim().min(1).catch("Not Found"),
  current_company: z.string().trim().min(1).catch("Not Found"),
  location: z.string().trim().min(1).catch("Not Found"),
  profile_url: z.string().trim().catch(""),
  source: z.string().trim().min(1).catch("Public Web Search"),
});

export type ExtractedSearchCandidate = z.infer<typeof extractedSearchCandidateSchema>;

export const extractedSearchCandidatesResponseSchema = z.object({
  candidates: z.array(extractedSearchCandidateSchema).catch([]),
});
