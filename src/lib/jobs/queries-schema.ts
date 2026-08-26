import { z } from "zod";

export const QUERY_TYPES = [
  "Exact Job Title",
  "Related Job Titles",
  "Must-Have Skills",
  "Industry",
  "Location",
  "Target Companies",
  "Previous Companies",
  "Seniority",
  "LinkedIn Discovery",
  "Company Website",
  "Public PDFs & Bios",
  "General",
] as const;

export const generatedQuerySchema = z.object({
  query_text: z.string().trim().min(1),
  query_type: z.string().trim().min(1).catch("General"),
});

export const searchQueriesResponseSchema = z.object({
  queries: z.array(generatedQuerySchema).min(1),
});

export type GeneratedSearchQuery = z.infer<typeof generatedQuerySchema>;

export interface SearchQuery extends GeneratedSearchQuery {
  id: string;
  job_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}
