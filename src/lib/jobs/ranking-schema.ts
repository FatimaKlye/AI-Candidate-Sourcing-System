import { z } from "zod";
import type { Candidate } from "@/lib/jobs/candidates-schema";

// AI evidence-comparison shapes: what the LLM is asked to return for a single
// candidate compared against the job's requirements. Scores are never asked
// from the model directly — they're computed from these structured statuses.
export const requirementStatusSchema = z
  .enum(["Match", "Partial", "Not Confirmed"])
  .catch("Not Confirmed");

export const requirementComparisonSchema = z.object({
  requirement: z.string().trim().min(1).catch("Not Specified"),
  status: requirementStatusSchema,
  evidence: z
    .string()
    .trim()
    .min(1)
    .catch("No mention found in the available candidate information."),
});

export type RequirementComparison = z.infer<typeof requirementComparisonSchema>;

export const candidateEvaluationSchema = z.object({
  must_have: z.array(requirementComparisonSchema).catch([]),
  preferred: z.array(requirementComparisonSchema).catch([]),
  skills: z.array(requirementComparisonSchema).catch([]),
  industry: requirementComparisonSchema,
  seniority: requirementComparisonSchema,
  location: requirementComparisonSchema,
  experience: requirementComparisonSchema,
});

export type CandidateEvaluation = z.infer<typeof candidateEvaluationSchema>;

// Stored, per-requirement breakdown shown in "View Full Analysis".
export const ANALYSIS_CATEGORY_LABELS = {
  must_have: "Must-Have",
  preferred: "Preferred",
  skills: "Skill",
  industry: "Industry",
  seniority: "Seniority",
  location: "Location",
  experience: "Experience",
} as const;

export type AnalysisCategory = keyof typeof ANALYSIS_CATEGORY_LABELS;

export interface AnalysisItem {
  category: AnalysisCategory;
  requirement: string;
  status: z.infer<typeof requirementStatusSchema>;
  evidence: string;
}

export interface CandidateMatch {
  id: string;
  job_id: string;
  candidate_id: string;
  user_id: string;
  overall_score: number;
  must_have_score: number;
  experience_score: number;
  industry_score: number;
  skills_score: number;
  seniority_score: number;
  location_score: number;
  preferred_score: number;
  strengths: string[];
  missing_requirements: string[];
  analysis: AnalysisItem[];
  shortlisted: boolean;
  created_at: string;
  updated_at: string;
}

export interface CandidateMatchWithCandidate extends CandidateMatch {
  candidate: Candidate;
}
