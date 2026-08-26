"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  analyzeJobDescription,
  OllamaConnectionError,
  OllamaResponseError,
} from "@/lib/ai/ollama";
import { extractTextFromFile, TextExtractionError } from "@/lib/jobs/extract-text";
import {
  jobRequirementsSchema,
  type JobRequirements,
  type JobRequirementsExtraction,
} from "@/lib/jobs/analysis-schema";

const JD_BUCKET = "job-descriptions";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function resolveJdText(
  supabase: SupabaseServerClient,
  jobId: string,
  userId: string,
): Promise<{ text?: string; error?: string }> {
  const { data: job } = await supabase
    .from("jobs")
    .select("jd_text, file_path, file_name")
    .eq("id", jobId)
    .eq("user_id", userId)
    .single();

  if (!job) {
    return { error: "Job not found." };
  }

  if (job.jd_text && job.jd_text.trim()) {
    return { text: job.jd_text };
  }

  if (!job.file_path) {
    return {
      error:
        "This job has no job description to analyze. Add a job description first.",
    };
  }

  const { data: fileData, error: downloadError } = await supabase.storage
    .from(JD_BUCKET)
    .download(job.file_path);

  if (downloadError || !fileData) {
    return {
      error:
        "We couldn't read the uploaded job description file. Try pasting the job description instead.",
    };
  }

  try {
    const buffer = Buffer.from(await fileData.arrayBuffer());
    const text = await extractTextFromFile(buffer, job.file_name ?? job.file_path);

    if (!text.trim()) {
      return {
        error:
          "We couldn't find any readable text in the uploaded file. Try pasting the job description instead.",
      };
    }

    // Cache the extracted text so future analyses skip re-parsing the file.
    await supabase
      .from("jobs")
      .update({ jd_text: text })
      .eq("id", jobId)
      .eq("user_id", userId);

    return { text };
  } catch (err) {
    if (err instanceof TextExtractionError) {
      return {
        error:
          "We couldn't read text from the uploaded file. Try pasting the job description instead.",
      };
    }
    return {
      error:
        "We couldn't read the uploaded job description file. Try pasting the job description instead.",
    };
  }
}

export interface AnalyzeJobResult {
  data?: JobRequirements;
  error?: string;
}

export async function analyzeJob(jobId: string): Promise<AnalyzeJobResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to analyze this job." };
  }

  const { text, error: textError } = await resolveJdText(supabase, jobId, user.id);
  if (textError || !text) {
    return { error: textError ?? "No job description to analyze." };
  }

  let extraction: JobRequirementsExtraction;
  try {
    extraction = await analyzeJobDescription(text);
  } catch (err) {
    if (err instanceof OllamaConnectionError || err instanceof OllamaResponseError) {
      return { error: err.message };
    }
    return {
      error: "Something went wrong while analyzing the job description. Please try again.",
    };
  }

  const { data: saved, error: saveError } = await supabase
    .from("job_requirements")
    .upsert({ job_id: jobId, ...extraction }, { onConflict: "job_id" })
    .select()
    .single();

  if (saveError || !saved) {
    return { error: "The analysis completed, but we couldn't save it. Please try again." };
  }

  revalidatePath(`/search/${jobId}/analysis`);
  return { data: saved as JobRequirements };
}

export interface SaveJobRequirementsResult {
  error?: string;
}

export async function saveJobRequirements(
  jobId: string,
  input: JobRequirementsExtraction,
): Promise<SaveJobRequirementsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to save changes." };
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("id")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .single();

  if (!job) {
    return { error: "Job not found." };
  }

  const parsed = jobRequirementsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Some fields are invalid. Please check your edits and try again." };
  }

  const { error } = await supabase
    .from("job_requirements")
    .upsert({ job_id: jobId, ...parsed.data }, { onConflict: "job_id" });

  if (error) {
    return { error: "Could not save changes. Please try again." };
  }

  revalidatePath(`/search/${jobId}/analysis`);
  return {};
}
