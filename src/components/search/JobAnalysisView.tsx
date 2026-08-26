"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { analyzeJob, saveJobRequirements } from "@/lib/jobs/analysis-actions";
import type {
  JobRequirements,
  JobRequirementsExtraction,
} from "@/lib/jobs/analysis-schema";

interface JobAnalysisViewProps {
  jobId: string;
  initialRequirements: JobRequirements | null;
}

interface FormState {
  job_title: string;
  location: string;
  seniority: string;
  industry: string;
  minimum_experience: string;
  education: string;
  certifications: string;
  responsibilities: string;
  must_have: string;
  preferred: string;
  required_skills: string;
  related_titles: string;
  target_companies: string;
  exclusions: string;
}

const LIST_FIELDS = [
  { key: "must_have", label: "Must-Have Requirements" },
  { key: "preferred", label: "Preferred Requirements" },
  { key: "required_skills", label: "Required Skills" },
  { key: "related_titles", label: "Relevant Job Titles" },
  { key: "target_companies", label: "Target Companies" },
  { key: "exclusions", label: "Exclusions" },
  { key: "certifications", label: "Certifications" },
  { key: "responsibilities", label: "Responsibilities" },
] as const satisfies ReadonlyArray<{ key: keyof FormState; label: string }>;

const TEXT_FIELDS = [
  { key: "job_title", label: "Job Title" },
  { key: "location", label: "Location" },
  { key: "seniority", label: "Seniority" },
  { key: "industry", label: "Industry" },
  { key: "minimum_experience", label: "Minimum Years of Experience" },
  { key: "education", label: "Education" },
] as const satisfies ReadonlyArray<{ key: keyof FormState; label: string }>;

function toFormState(data: JobRequirementsExtraction): FormState {
  return {
    job_title: data.job_title,
    location: data.location,
    seniority: data.seniority,
    industry: data.industry,
    minimum_experience: data.minimum_experience,
    education: data.education,
    certifications: data.certifications.join("\n"),
    responsibilities: data.responsibilities.join("\n"),
    must_have: data.must_have.join("\n"),
    preferred: data.preferred.join("\n"),
    required_skills: data.required_skills.join("\n"),
    related_titles: data.related_titles.join("\n"),
    target_companies: data.target_companies.join("\n"),
    exclusions: data.exclusions.join("\n"),
  };
}

function toExtraction(form: FormState): JobRequirementsExtraction {
  const splitLines = (value: string) =>
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

  return {
    job_title: form.job_title.trim() || "Not Specified",
    location: form.location.trim() || "Not Specified",
    seniority: form.seniority.trim() || "Not Specified",
    industry: form.industry.trim() || "Not Specified",
    minimum_experience: form.minimum_experience.trim() || "Not Specified",
    education: form.education.trim() || "Not Specified",
    certifications: splitLines(form.certifications),
    responsibilities: splitLines(form.responsibilities),
    must_have: splitLines(form.must_have),
    preferred: splitLines(form.preferred),
    required_skills: splitLines(form.required_skills),
    related_titles: splitLines(form.related_titles),
    target_companies: splitLines(form.target_companies),
    exclusions: splitLines(form.exclusions),
  };
}

type Status = "idle" | "loading" | "ready" | "error";
type LoadingPhase = "analyzing" | "extracting";

export function JobAnalysisView({ jobId, initialRequirements }: JobAnalysisViewProps) {
  const [status, setStatus] = useState<Status>(initialRequirements ? "ready" : "idle");
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>("analyzing");
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(
    initialRequirements ? toFormState(initialRequirements) : null,
  );
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [isAnalyzing, startAnalyzing] = useTransition();
  const [isSaving, startSaving] = useTransition();

  const hasAutoStarted = useRef(false);

  function runAnalysis() {
    setStatus("loading");
    setLoadingPhase("analyzing");
    setError(null);
    setSaveMessage(null);

    const phaseTimer = setTimeout(() => setLoadingPhase("extracting"), 1500);

    startAnalyzing(async () => {
      const result = await analyzeJob(jobId);
      clearTimeout(phaseTimer);

      if (result.error || !result.data) {
        setStatus("error");
        setError(result.error ?? "Something went wrong. Please try again.");
        return;
      }

      setForm(toFormState(result.data));
      setStatus("ready");
    });
  }

  useEffect(() => {
    if (hasAutoStarted.current || initialRequirements) return;
    hasAutoStarted.current = true;
    runAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateField(key: keyof FormState, value: string) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaveMessage(null);
  }

  function handleSave() {
    if (!form) return;
    setError(null);
    setSaveMessage(null);

    startSaving(async () => {
      const result = await saveJobRequirements(jobId, toExtraction(form));
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaveMessage("Changes saved.");
    });
  }

  if (status === "loading") {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <svg
          className="h-8 w-8 animate-spin text-indigo-600"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
        <p className="text-sm font-medium text-slate-700">
          {loadingPhase === "analyzing"
            ? "Analyzing job description..."
            : "Extracting role requirements..."}
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
        <div className="flex gap-3">
          <Link
            href={`/requisitions/${jobId}`}
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
          >
            Back
          </Link>
          <Button type="button" onClick={runAnalysis} isLoading={isAnalyzing}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (status === "idle" || !form) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      {TEXT_FIELDS.map(({ key, label }) => (
        <Input
          key={key}
          label={label}
          name={key}
          value={form[key]}
          onChange={(event) => updateField(key, event.target.value)}
        />
      ))}

      {LIST_FIELDS.map(({ key, label }) => (
        <div key={key} className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700" htmlFor={key}>
            {label}
          </label>
          <textarea
            id={key}
            rows={4}
            value={form[key]}
            onChange={(event) => updateField(key, event.target.value)}
            placeholder="One item per line"
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      ))}

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {saveMessage && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {saveMessage}
        </p>
      )}

      <div className="flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row">
        <Link
          href={`/requisitions/${jobId}`}
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 sm:shrink-0"
        >
          Back
        </Link>
        <Button
          type="button"
          variant="outline"
          onClick={handleSave}
          isLoading={isSaving}
          className="flex-1"
        >
          Save Changes
        </Button>
        <Link
          href={`/requisitions/${jobId}/candidates`}
          className="inline-flex flex-1 items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          Continue to Candidate Sourcing
        </Link>
      </div>
    </div>
  );
}
