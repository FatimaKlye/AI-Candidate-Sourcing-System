"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getFileExtension, validateJdFile } from "@/lib/jobs/validation";

const JD_BUCKET = "job-descriptions";

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};

export interface CreateJobResult {
  error?: string;
}

export async function createJob(formData: FormData): Promise<CreateJobResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to save a search." };
  }

  const searchName = String(formData.get("searchName") ?? "").trim();
  const companyName = String(formData.get("companyName") ?? "").trim();
  const sourceType = String(formData.get("sourceType") ?? "");
  const jdText = String(formData.get("jdText") ?? "").trim();
  const file = formData.get("file");

  if (!searchName) {
    return { error: "Search name is required." };
  }

  if (sourceType !== "upload" && sourceType !== "paste") {
    return { error: "Provide a job description before continuing." };
  }

  let fileName: string | null = null;
  let filePath: string | null = null;

  if (sourceType === "upload") {
    if (!(file instanceof File)) {
      return { error: "Attach a job description file." };
    }

    const fileError = validateJdFile(file);
    if (fileError) {
      return { error: fileError };
    }

    const extension = getFileExtension(file.name);
    const storagePath = `${user.id}/${randomUUID()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from(JD_BUCKET)
      .upload(storagePath, file, {
        contentType: CONTENT_TYPES[extension] ?? file.type,
      });

    if (uploadError) {
      return { error: `Upload failed: ${uploadError.message}` };
    }

    fileName = file.name;
    filePath = storagePath;
  } else if (!jdText) {
    return { error: "Paste a job description before continuing." };
  }

  const { error: insertError } = await supabase.from("jobs").insert({
    user_id: user.id,
    search_name: searchName,
    company_name: companyName || null,
    jd_text: sourceType === "paste" ? jdText : null,
    file_name: fileName,
    file_path: filePath,
    status: "draft",
  });

  if (insertError) {
    if (filePath) {
      await supabase.storage.from(JD_BUCKET).remove([filePath]);
    }
    return { error: insertError.message };
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export interface DeleteJobResult {
  error?: string;
}

export async function deleteJob(jobId: string): Promise<DeleteJobResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in." };
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("file_path")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .single();

  const { error } = await supabase
    .from("jobs")
    .delete()
    .eq("id", jobId)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  if (job?.file_path) {
    await supabase.storage.from(JD_BUCKET).remove([job.file_path]);
  }

  revalidatePath("/dashboard");
  return {};
}
