import { z } from "zod";

const requiredText = z.string().trim().min(1).catch("Not Specified");

const stringList = z
  .array(z.string().trim().min(1))
  .catch([])
  .transform((values) => values.filter(Boolean));

export const jobRequirementsSchema = z.object({
  job_title: requiredText,
  location: requiredText,
  seniority: requiredText,
  industry: requiredText,
  minimum_experience: requiredText,
  must_have: stringList,
  preferred: stringList,
  required_skills: stringList,
  related_titles: stringList,
  target_companies: stringList,
  exclusions: stringList,
});

export type JobRequirementsExtraction = z.infer<typeof jobRequirementsSchema>;

export interface JobRequirements extends JobRequirementsExtraction {
  id: string;
  job_id: string;
  created_at: string;
  updated_at: string;
}
