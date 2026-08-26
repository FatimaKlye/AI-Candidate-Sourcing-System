"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  generateQueries,
  saveSearchQueries,
} from "@/lib/jobs/queries-actions";
import type { SearchQuery } from "@/lib/jobs/queries-schema";

interface QueriesViewProps {
  jobId: string;
  hasRequirements: boolean;
  initialQueries: SearchQuery[];
}

interface DraftQuery {
  key: string;
  query_text: string;
  query_type: string;
}

type Status = "idle" | "generating" | "ready" | "error";

const TYPE_STYLES: Record<string, string> = {
  "Exact Job Title": "bg-indigo-50 text-indigo-700",
  "Related Job Titles": "bg-violet-50 text-violet-700",
  "Must-Have Skills": "bg-amber-50 text-amber-700",
  Industry: "bg-sky-50 text-sky-700",
  Location: "bg-teal-50 text-teal-700",
  "Target Companies": "bg-rose-50 text-rose-700",
  "Previous Companies": "bg-rose-50 text-rose-700",
  Seniority: "bg-fuchsia-50 text-fuchsia-700",
  "LinkedIn Discovery": "bg-blue-50 text-blue-700",
  "Company Website": "bg-emerald-50 text-emerald-700",
  "Public PDFs & Bios": "bg-orange-50 text-orange-700",
};

function typeBadgeClass(type: string) {
  return TYPE_STYLES[type] ?? "bg-slate-100 text-slate-700";
}

function toDraft(query: { query_text: string; query_type: string }, key: string): DraftQuery {
  return { key, query_text: query.query_text, query_type: query.query_type };
}

let tempIdCounter = 0;
function nextTempKey() {
  tempIdCounter += 1;
  return `draft-${tempIdCounter}`;
}

export function QueriesView({ jobId, hasRequirements, initialQueries }: QueriesViewProps) {
  const router = useRouter();

  const [status, setStatus] = useState<Status>(
    initialQueries.length > 0 ? "ready" : "idle",
  );
  const [queries, setQueries] = useState<DraftQuery[]>(
    initialQueries.map((q) => toDraft(q, q.id)),
  );
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [isGenerating, startGenerating] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const [isContinuing, startContinuing] = useTransition();

  const hasAutoStarted = useRef(false);

  function runGenerate() {
    setStatus("generating");
    setError(null);
    setSaveMessage(null);

    startGenerating(async () => {
      const result = await generateQueries(jobId);
      if (result.error || !result.data) {
        setStatus("error");
        setError(result.error ?? "Something went wrong. Please try again.");
        return;
      }

      setQueries(result.data.map((q) => toDraft(q, nextTempKey())));
      setIsDirty(true);
      setStatus("ready");
    });
  }

  useEffect(() => {
    if (hasAutoStarted.current || initialQueries.length > 0 || !hasRequirements) return;
    hasAutoStarted.current = true;
    runGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateQuery(key: string, patch: Partial<Pick<DraftQuery, "query_text" | "query_type">>) {
    setQueries((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q)));
    setIsDirty(true);
    setSaveMessage(null);
  }

  function deleteQuery(key: string) {
    setQueries((prev) => prev.filter((q) => q.key !== key));
    setIsDirty(true);
    setSaveMessage(null);
    if (editingKey === key) setEditingKey(null);
  }

  function addQuery() {
    const key = nextTempKey();
    setQueries((prev) => [...prev, { key, query_text: "", query_type: "General" }]);
    setEditingKey(key);
    setIsDirty(true);
    setSaveMessage(null);
  }

  async function copyQuery(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1500);
    } catch {
      // Clipboard access can fail (permissions, insecure context); not worth surfacing.
    }
  }

  function openSearch(text: string) {
    if (!text.trim()) return;
    window.open(
      `https://www.google.com/search?q=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  function prepareForSave() {
    const cleaned = queries
      .map((q) => ({ query_text: q.query_text.trim(), query_type: q.query_type.trim() || "General" }))
      .filter((q) => q.query_text.length > 0);

    if (cleaned.length === 0) {
      setError("Add at least one search query before saving.");
      return null;
    }

    setError(null);
    setSaveMessage(null);
    return cleaned;
  }

  function handleSave() {
    const cleaned = prepareForSave();
    if (!cleaned) return;

    startSaving(async () => {
      const result = await saveSearchQueries(jobId, cleaned);
      if (result.error || !result.data) {
        setError(result.error ?? "Could not save the search strategy. Please try again.");
        return;
      }

      setQueries(result.data.map((q) => toDraft(q, q.id)));
      setIsDirty(false);
      setSaveMessage("Search strategy saved.");
    });
  }

  function handleContinue() {
    if (!isDirty) {
      router.push(`/search/${jobId}/candidates`);
      return;
    }

    const cleaned = prepareForSave();
    if (!cleaned) return;

    startContinuing(async () => {
      const result = await saveSearchQueries(jobId, cleaned);
      if (result.error || !result.data) {
        setError(result.error ?? "Could not save the search strategy. Please try again.");
        return;
      }

      setQueries(result.data.map((q) => toDraft(q, q.id)));
      setIsDirty(false);
      router.push(`/search/${jobId}/candidates`);
    });
  }

  if (!hasRequirements) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Analyze this job&apos;s requirements before generating search queries.
        </p>
        <Link
          href={`/search/${jobId}/analysis`}
          className="inline-flex w-fit items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          Go to Job Analysis
        </Link>
      </div>
    );
  }

  if (status === "generating") {
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
          Generating search queries from the job requirements...
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        <Button type="button" onClick={runGenerate} isLoading={isGenerating}>
          Try Again
        </Button>
      </div>
    );
  }

  if (status === "idle") {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        {queries.length === 0 && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
            No search queries yet. Add one manually or regenerate.
          </p>
        )}

        {queries.map((query) => {
          const isEditing = editingKey === query.key;
          return (
            <div
              key={query.key}
              className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${typeBadgeClass(query.query_type)}`}
                >
                  {query.query_type}
                </span>
              </div>

              {isEditing ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    rows={2}
                    autoFocus
                    value={query.query_text}
                    onChange={(event) => updateQuery(query.key, { query_text: event.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    placeholder="Enter a search query"
                  />
                  <input
                    type="text"
                    value={query.query_type}
                    onChange={(event) => updateQuery(query.key, { query_type: event.target.value })}
                    className="w-full max-w-xs rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    placeholder="Query type"
                  />
                </div>
              ) : (
                <p className="break-words rounded-lg bg-slate-50 px-3 py-2 font-mono text-sm text-slate-800">
                  {query.query_text || (
                    <span className="text-slate-400">Empty query</span>
                  )}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="px-3 py-1.5 text-xs"
                  onClick={() => copyQuery(query.key, query.query_text)}
                >
                  {copiedKey === query.key ? "Copied!" : "Copy"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="px-3 py-1.5 text-xs"
                  onClick={() => setEditingKey(isEditing ? null : query.key)}
                >
                  {isEditing ? "Done" : "Edit"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                  onClick={() => deleteQuery(query.key)}
                >
                  Delete
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  className="ml-auto px-3 py-1.5 text-xs"
                  onClick={() => openSearch(query.query_text)}
                >
                  Open Search
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Button type="button" variant="outline" onClick={addQuery} className="w-fit">
        + Add Search Query
      </Button>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {saveMessage && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {saveMessage}
        </p>
      )}

      <div className="flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          onClick={runGenerate}
          isLoading={isGenerating}
          className="sm:shrink-0"
        >
          Regenerate Queries
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={handleSave}
          isLoading={isSaving}
          className="flex-1"
        >
          Save Search Strategy
        </Button>
        <Button
          type="button"
          onClick={handleContinue}
          isLoading={isContinuing}
          className="flex-1"
        >
          Continue to Candidate Discovery
        </Button>
      </div>
    </div>
  );
}
