"use client";

import { ChangeEvent, DragEvent, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { createJob } from "@/lib/jobs/actions";
import { formatFileSize, validateJdFile } from "@/lib/jobs/validation";

type SourceType = "upload" | "paste";
type Step = "source" | "details";

export function NewSearchWizard() {
  const [step, setStep] = useState<Step>("source");
  const [sourceType, setSourceType] = useState<SourceType | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [jdText, setJdText] = useState("");

  const [searchName, setSearchName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [department, setDepartment] = useState("");
  const [location, setLocation] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [minimumMatchScore, setMinimumMatchScore] = useState("70");
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function pickFile(candidate: File) {
    const error = validateJdFile(candidate);
    if (error) {
      setFile(null);
      setFileError(error);
      return;
    }
    setFile(candidate);
    setFileError(null);
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const candidate = event.target.files?.[0];
    if (candidate) pickFile(candidate);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const candidate = event.dataTransfer.files?.[0];
    if (candidate) pickFile(candidate);
  }

  function removeFile() {
    setFile(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function continueWithUpload() {
    if (!file) return;
    setSourceType("upload");
    setStep("details");
  }

  function continueWithPaste() {
    if (!jdText.trim()) return;
    setSourceType("paste");
    setStep("details");
  }

  function handleSave() {
    setFormError(null);

    if (!searchName.trim()) {
      setFormError("Search name is required.");
      return;
    }
    if (sourceType === "upload" && !file) {
      setFormError("Attach a job description file.");
      return;
    }
    if (sourceType === "paste" && !jdText.trim()) {
      setFormError("Paste a job description before saving.");
      return;
    }

    const formData = new FormData();
    formData.set("searchName", searchName.trim());
    formData.set("companyName", companyName.trim());
    formData.set("department", department.trim());
    formData.set("location", location.trim());
    formData.set("employmentType", employmentType.trim());
    formData.set("minimumMatchScore", minimumMatchScore);
    formData.set("sourceType", sourceType ?? "");
    if (sourceType === "paste") {
      formData.set("jdText", jdText);
    } else if (sourceType === "upload" && file) {
      formData.set("file", file);
    }

    startTransition(async () => {
      const result = await createJob(formData);
      if (result?.error) {
        setFormError(result.error);
      }
    });
  }

  if (step === "details") {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Requisition details</h2>
        <p className="mt-1 text-sm text-slate-500">
          {sourceType === "upload"
            ? `Using file: ${file?.name}`
            : `Using pasted job description (${jdText.trim().length.toLocaleString()} characters)`}
        </p>

        <div className="mt-6 flex flex-col gap-5">
          <Input
            label="Job title / requisition name"
            name="searchName"
            placeholder="Finance Director - Philippines"
            value={searchName}
            onChange={(event) => setSearchName(event.target.value)}
            required
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <Input label="Department" name="department" placeholder="Engineering" value={department} onChange={(event) => setDepartment(event.target.value)} />
            <Input label="Location" name="location" placeholder="Manila / Hybrid" value={location} onChange={(event) => setLocation(event.target.value)} />
            <Input label="Employment type" name="employmentType" placeholder="Full-time" value={employmentType} onChange={(event) => setEmploymentType(event.target.value)} />
            <Input label="Minimum match score" name="minimumMatchScore" type="number" min="0" max="100" value={minimumMatchScore} onChange={(event) => setMinimumMatchScore(event.target.value)} />
          </div>
          <Input
            label="Client / Company (optional)"
            name="companyName"
            placeholder="ABC Corporation"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
          />

          {formError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep("source")}
              disabled={isPending}
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              isLoading={isPending}
              className="flex-1"
            >
              Save and review requirements
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          Option 1 — Upload Job Description
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Drag and drop a PDF, DOCX, or TXT file, or browse your computer.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          className="hidden"
          onChange={handleFileInputChange}
        />

        {!file ? (
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={cn(
              "mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors",
              isDragging
                ? "border-indigo-500 bg-indigo-50"
                : "border-slate-300 bg-slate-50 hover:border-slate-400",
            )}
          >
            <p className="text-sm font-medium text-slate-700">
              Drag and drop your file here, or{" "}
              <span className="font-semibold text-indigo-600">browse</span>
            </p>
            <p className="text-xs text-slate-400">PDF, DOCX, or TXT · up to 10MB</p>
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">
                {file.name}
              </p>
              <p className="text-xs text-slate-500">
                {file.name.split(".").pop()?.toUpperCase()} ·{" "}
                {formatFileSize(file.size)}
              </p>
            </div>
            <button
              type="button"
              onClick={removeFile}
              className="shrink-0 text-sm font-medium text-red-600 hover:text-red-500"
            >
              Remove
            </button>
          </div>
        )}

        {fileError && (
          <p className="mt-2 text-sm text-red-600">{fileError}</p>
        )}

        <Button
          type="button"
          onClick={continueWithUpload}
          disabled={!file || !!fileError}
          className="mt-4 w-full"
        >
          Upload Job Description
        </Button>
      </section>

      <div className="relative flex items-center py-1">
        <div className="flex-1 border-t border-slate-200" />
        <span className="px-3 text-xs font-medium uppercase tracking-wide text-slate-400">
          or
        </span>
        <div className="flex-1 border-t border-slate-200" />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          Option 2 — Paste Job Description
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Paste the full text of the job description below.
        </p>

        <textarea
          rows={10}
          placeholder="Paste the complete job description here..."
          value={jdText}
          onChange={(event) => setJdText(event.target.value)}
          className="mt-4 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        <p className="mt-1 text-right text-xs text-slate-400">
          {jdText.length.toLocaleString()} characters
        </p>

        <Button
          type="button"
          onClick={continueWithPaste}
          disabled={!jdText.trim()}
          className="mt-4 w-full"
        >
          Continue
        </Button>
      </section>
    </div>
  );
}
