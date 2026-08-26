"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getHrSession } from "@/lib/hr/context";
import { calculateCandidateMatch } from "@/lib/hr/scoring";

const candidateSchema = z.object({
  jobId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(160),
  currentTitle: z.string().trim().max(160).default("Not Found"),
  currentCompany: z.string().trim().max(160).default("Not Found"),
  location: z.string().trim().max(160).default("Not Found"),
  profileUrl: z.union([z.url(), z.literal("")]),
  source: z.string().trim().min(2).max(100),
  skills: z.string(),
  yearsExperience: z.coerce.number().min(0).max(80).optional(),
  seniority: z.string().trim().max(100).optional(),
  availability: z.string().trim().max(100).optional(),
});

async function addActivity(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  workspaceId: string,
  actorId: string,
  eventType: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
) {
  await supabase.from("activity_logs").insert({
    workspace_id: workspaceId,
    actor_id: actorId,
    event_type: eventType,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });
}

export async function addCandidate(formData: FormData) {
  const context = await getHrSession();
  if (!context.user || !context.workspace) redirect("/login");

  const parsed = candidateSchema.safeParse({
    jobId: formData.get("jobId"),
    fullName: formData.get("fullName"),
    currentTitle: formData.get("currentTitle") || "Not Found",
    currentCompany: formData.get("currentCompany") || "Not Found",
    location: formData.get("location") || "Not Found",
    profileUrl: formData.get("profileUrl") || "",
    source: formData.get("source") || "Manual HR entry",
    skills: formData.get("skills") || "",
    yearsExperience: formData.get("yearsExperience") || undefined,
    seniority: formData.get("seniority") || undefined,
    availability: formData.get("availability") || undefined,
  });
  if (!parsed.success) redirect(`/requisitions/${String(formData.get("jobId"))}/candidates?error=invalid-candidate`);

  const { data: job } = await context.supabase
    .from("jobs")
    .select("id, workspace_id")
    .eq("id", parsed.data.jobId)
    .eq("workspace_id", context.workspace.id)
    .maybeSingle();
  if (!job) redirect("/requisitions");

  const skills = parsed.data.skills
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const { data: candidate, error } = await context.supabase
    .from("candidates")
    .insert({
      workspace_id: context.workspace.id,
      job_id: job.id,
      user_id: context.user.id,
      full_name: parsed.data.fullName,
      current_title: parsed.data.currentTitle || "Not Found",
      current_company: parsed.data.currentCompany || "Not Found",
      location: parsed.data.location || "Not Found",
      profile_url: parsed.data.profileUrl || null,
      source: parsed.data.source,
      skills,
      years_experience: parsed.data.yearsExperience ?? null,
      seniority: parsed.data.seniority || null,
      availability: parsed.data.availability || null,
      status: "New",
    })
    .select("id")
    .single();
  if (error || !candidate) redirect(`/requisitions/${job.id}/candidates?error=save-failed`);

  const { data: requirements } = await context.supabase
    .from("job_requirements")
    .select("*")
    .eq("job_id", job.id)
    .maybeSingle();
  if (requirements) {
    const score = calculateCandidateMatch(
      requirements,
      {
        skills,
        years_experience: parsed.data.yearsExperience,
        location: parsed.data.location,
        seniority: parsed.data.seniority,
      },
      context.workspace.settings?.weights,
    );
    await context.supabase.from("candidate_matches").insert({
      workspace_id: context.workspace.id,
      job_id: job.id,
      candidate_id: candidate.id,
      user_id: context.user.id,
      ...score,
      analysis: score.score_breakdown,
      review_status: "New",
    });
  }

  await addActivity(context.supabase, context.workspace.id, context.user.id, "candidate_added", "candidate", candidate.id, { job_id: job.id, source: parsed.data.source });
  revalidatePath("/candidate-pool");
  revalidatePath(`/requisitions/${job.id}/candidates`);
  redirect(`/candidates/${candidate.id}`);
}

export async function toggleShortlist(candidateId: string, matchId: string, shortlisted: boolean) {
  const context = await getHrSession();
  if (!context.user || !context.workspace) return;
  await context.supabase
    .from("candidate_matches")
    .update({ shortlisted, review_status: shortlisted ? "Shortlisted" : "Under Review", last_activity_at: new Date().toISOString() })
    .eq("id", matchId)
    .eq("candidate_id", candidateId)
    .eq("workspace_id", context.workspace.id);
  await context.supabase.from("candidates").update({ status: shortlisted ? "Shortlisted" : "Under Review" }).eq("id", candidateId).eq("workspace_id", context.workspace.id);
  await addActivity(context.supabase, context.workspace.id, context.user.id, shortlisted ? "candidate_shortlisted" : "candidate_removed_from_shortlist", "candidate", candidateId);
  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath("/shortlisted");
  revalidatePath("/matched-applicants");
}

export async function updateCandidateReview(candidateId: string, matchId: string, formData: FormData) {
  const context = await getHrSession();
  if (!context.user || !context.workspace) return;
  const status = String(formData.get("status") ?? "Under Review");
  const allowed = ["New", "Under Review", "Shortlisted", "Contacted", "Interview", "Rejected", "Archived"];
  if (!allowed.includes(status)) return;
  const followUp = String(formData.get("followUp") ?? "");
  await context.supabase.from("candidate_matches").update({
    review_status: status,
    shortlisted: status === "Shortlisted",
    follow_up_at: followUp || null,
    last_activity_at: new Date().toISOString(),
  }).eq("id", matchId).eq("workspace_id", context.workspace.id);
  await context.supabase.from("candidates").update({ status }).eq("id", candidateId).eq("workspace_id", context.workspace.id);
  await addActivity(context.supabase, context.workspace.id, context.user.id, "candidate_status_changed", "candidate", candidateId, { status, follow_up_at: followUp || null });
  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath("/activity");
}

export async function addCandidateNote(candidateId: string, jobId: string, formData: FormData) {
  const context = await getHrSession();
  if (!context.user || !context.workspace) return;
  const note = String(formData.get("note") ?? "").trim();
  if (!note || note.length > 5000) return;
  await context.supabase.from("candidate_notes").insert({
    workspace_id: context.workspace.id,
    candidate_id: candidateId,
    job_id: jobId,
    author_id: context.user.id,
    note,
  });
  await addActivity(context.supabase, context.workspace.id, context.user.id, "candidate_note_added", "candidate", candidateId);
  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath("/activity");
}

export async function archiveRequisition(jobId: string) {
  const context = await getHrSession();
  if (!context.user || !context.workspace) return;
  await context.supabase.from("jobs").update({ status: "archived", archived_at: new Date().toISOString() }).eq("id", jobId).eq("workspace_id", context.workspace.id);
  await addActivity(context.supabase, context.workspace.id, context.user.id, "requisition_archived", "requisition", jobId);
  revalidatePath("/requisitions");
  revalidatePath("/dashboard");
}

export async function startSourcingRun(jobId: string) {
  const context = await getHrSession();
  if (!context.user || !context.workspace) return;
  const { data: job } = await context.supabase.from("jobs").select("id, search_name, department, location, employment_type, minimum_match_score").eq("id", jobId).eq("workspace_id", context.workspace.id).maybeSingle();
  if (!job) return;
  const { data: requirements } = await context.supabase.from("job_requirements").select("*").eq("job_id", jobId).maybeSingle();
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  const initialStatus = webhookUrl ? "queued" : "configuration_required";
  const { data: run } = await context.supabase.from("sourcing_runs").insert({ workspace_id: context.workspace.id, job_id: jobId, started_by: context.user.id, status: initialStatus, provider: "n8n" }).select("id").single();
  if (webhookUrl && run) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(process.env.N8N_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.N8N_WEBHOOK_TOKEN}` } : {}) },
        body: JSON.stringify({ run_id: run.id, workspace_id: context.workspace.id, job, requirements }),
        signal: AbortSignal.timeout(15_000),
      });
      await context.supabase.from("sourcing_runs").update({ status: response.ok ? "running" : "failed", error_message: response.ok ? null : `Webhook returned ${response.status}` }).eq("id", run.id);
    } catch (error) {
      await context.supabase.from("sourcing_runs").update({ status: "failed", error_message: error instanceof Error ? error.message : "Could not reach n8n" }).eq("id", run.id);
    }
  }
  await addActivity(context.supabase, context.workspace.id, context.user.id, "candidate_search_started", "requisition", jobId, { run_id: run?.id ?? null, provider: "n8n" });
  revalidatePath(`/requisitions/${jobId}/candidates`);
  revalidatePath("/activity");
}

export async function saveSettings(formData: FormData) {
  const context = await getHrSession();
  if (!context.user || !context.workspace) return;
  const fullName = String(formData.get("fullName") ?? "").trim();
  const minimumScore = Math.min(100, Math.max(0, Number(formData.get("minimumScore") ?? 70)));
  await context.supabase.from("profiles").update({ full_name: fullName || null }).eq("id", context.user.id);
  await context.supabase.from("workspaces").update({ settings: { ...context.workspace.settings, default_minimum_match_score: minimumScore } }).eq("id", context.workspace.id);
  await addActivity(context.supabase, context.workspace.id, context.user.id, "settings_updated", "workspace", context.workspace.id);
  revalidatePath("/settings");
}
