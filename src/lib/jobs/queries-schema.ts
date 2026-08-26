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
  "Public PDFs & Bios",
  "General",
] as const;

// Broadest, most-likely-to-return-results query types first. The pipeline
// only runs the first MAX_QUERIES_PER_RUN queries per job, and the local
// model's own ordering isn't reliable, so this ranking is applied in code
// (see pipeline-actions.ts) rather than trusted from the LLM output alone.
const QUERY_TYPE_PRIORITY: readonly string[] = [
  "Exact Job Title",
  "Location",
  "Related Job Titles",
  "Must-Have Skills",
  "LinkedIn Discovery",
  "Industry",
  "Seniority",
  "General",
  "Target Companies",
  "Previous Companies",
  "Public PDFs & Bios",
];

export function queryTypeRank(queryType: string): number {
  const index = QUERY_TYPE_PRIORITY.indexOf(queryType);
  return index === -1 ? QUERY_TYPE_PRIORITY.length : index;
}

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
