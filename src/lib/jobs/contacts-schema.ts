export const CONTACT_STATUSES = [
  "Publicly Found",
  "Possible",
  "Not Verified",
  "Not Found",
] as const;

export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export interface CandidateContact {
  id: string;
  candidate_id: string;
  job_id: string;
  user_id: string;
  email: string | null;
  email_status: ContactStatus;
  phone: string | null;
  phone_status: ContactStatus;
  source_name: string | null;
  source_url: string | null;
  confidence: number;
  created_at: string;
  updated_at: string;
}
