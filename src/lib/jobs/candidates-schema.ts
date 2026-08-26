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

// AI extraction shapes: what the LLM is asked to return for each search
// result it's shown, before we turn it into a DiscoveredCandidate.
export const extractedCandidateSchema = z.object({
  index: z.number().int().min(0),
  is_person: z.boolean(),
  full_name: z.string().trim().min(1).catch("Not Found"),
  current_title: z.string().trim().min(1).catch("Not Found"),
  current_company: z.string().trim().min(1).catch("Not Found"),
  location: z.string().trim().min(1).catch("Not Found"),
});

export const candidateExtractionResponseSchema = z.object({
  candidates: z.array(extractedCandidateSchema),
});

export type ExtractedCandidateInfo = z.infer<typeof extractedCandidateSchema>;
