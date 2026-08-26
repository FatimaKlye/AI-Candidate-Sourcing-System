export type JobStatus = "draft";

export interface Job {
  id: string;
  user_id: string;
  search_name: string;
  company_name: string | null;
  jd_text: string | null;
  file_name: string | null;
  file_path: string | null;
  status: JobStatus;
  created_at: string;
  updated_at: string;
}
