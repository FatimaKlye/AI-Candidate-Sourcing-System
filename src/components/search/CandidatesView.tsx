"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  addCandidateManually,
  extractCandidateFromUrl,
  importCandidate,
} from "@/lib/jobs/candidates-actions";
import type { Candidate } from "@/lib/jobs/candidates-schema";

interface QuerySummary {
  id: string;
  query_text: string;
  query_type: string;
}

interface CandidatesViewProps {
  jobId: string;
  initialQueries: QuerySummary[];
  initialCandidates: Candidate[];
}

const ALL_FILTER = "All";

const FILTER_FIELDS = [
  { key: "current_company", label: "Company" },
  { key: "location", label: "Location" },
  { key: "current_title", label: "Job Title" },
  { key: "source", label: "Source" },
] as const;

type FilterKey = (typeof FILTER_FIELDS)[number]["key"];
type Filters = Record<FilterKey, string>;

const EMPTY_FILTERS: Filters = {
  current_company: ALL_FILTER,
  location: ALL_FILTER,
  current_title: ALL_FILTER,
  source: ALL_FILTER,
};

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

// Client-side convenience link only (no server dependency) — opens the same
// local SearXNG instance the automated pipeline searches, in its normal
// HTML results view, for manual/advanced review.
function searxngSearchUrl(query: string): string {
  return `http://localhost:8888/search?q=${encodeURIComponent(query)}`;
}

const emptyManualDraft = {
  full_name: "",
  current_title: "",
  current_company: "",
  location: "",
  profile_url: "",
};

const emptyImportDraft = {
  profile_url: "",
  full_name: "",
  current_title: "",
  current_company: "",
  location: "",
  source: "",
};

const linkButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400";

export function CandidatesView({ jobId, initialQueries, initialCandidates }: CandidatesViewProps) {
  const router = useRouter();

  const [candidates, setCandidates] = useState<Candidate[]>(initialCandidates);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const [addMode, setAddMode] = useState<"none" | "manual" | "import">("none");

  const [manualDraft, setManualDraft] = useState(emptyManualDraft);
  const [manualError, setManualError] = useState<string | null>(null);

  const [importDraft, setImportDraft] = useState(emptyImportDraft);
  const [importError, setImportError] = useState<string | null>(null);
  const [extractionNote, setExtractionNote] = useState<string | null>(null);
  const [hasExtracted, setHasExtracted] = useState(false);

  const [isAdding, startAdding] = useTransition();
  const [isExtracting, startExtracting] = useTransition();
  const [isContinuing, startContinuing] = useTransition();

  function handleManualChange(field: keyof typeof emptyManualDraft, value: string) {
    setManualDraft((prev) => ({ ...prev, [field]: value }));
  }

  function handleAddCandidate() {
    setManualError(null);
    startAdding(async () => {
      const result = await addCandidateManually(jobId, manualDraft);
      if (result.error || !result.data) {
        setManualError(result.error ?? "Could not add the candidate. Please try again.");
        return;
      }

      setCandidates((prev) => [result.data as Candidate, ...prev]);
      setManualDraft(emptyManualDraft);
      setAddMode("none");
    });
  }

  function handleImportChange(field: keyof typeof emptyImportDraft, value: string) {
    setImportDraft((prev) => ({ ...prev, [field]: value }));
  }

  function handleExtract() {
    setImportError(null);
    setExtractionNote(null);
    startExtracting(async () => {
      const result = await extractCandidateFromUrl(jobId, importDraft.profile_url);
      if (result.error || !result.data) {
        setExtractionNote(
          result.error ?? "Could not extract details automatically. Enter them manually below.",
        );
        setHasExtracted(true);
        return;
      }

      setImportDraft((prev) => ({
        ...prev,
        full_name: result.data!.full_name === "Not Found" ? "" : result.data!.full_name,
        current_title: result.data!.current_title === "Not Found" ? "" : result.data!.current_title,
        current_company:
          result.data!.current_company === "Not Found" ? "" : result.data!.current_company,
        location: result.data!.location === "Not Found" ? "" : result.data!.location,
        source: result.data!.source,
      }));
      setExtractionNote("Details extracted — review and edit before saving.");
      setHasExtracted(true);
    });
  }

  function handleSaveImport() {
    setImportError(null);
    startAdding(async () => {
      const result = await importCandidate(jobId, importDraft);
      if (result.error || !result.data) {
        setImportError(result.error ?? "Could not import the candidate. Please try again.");
        return;
      }

      setCandidates((prev) => [result.data as Candidate, ...prev]);
      setImportDraft(emptyImportDraft);
      setExtractionNote(null);
      setHasExtracted(false);
      setAddMode("none");
    });
  }

  function handleContinue() {
    startContinuing(async () => {
      router.push(`/search/${jobId}/ranking`);
    });
  }

  function openSource(candidate: Candidate) {
    const url = candidate.source_url ?? candidate.profile_url;
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const filterOptions = useMemo(() => {
    const options: Record<FilterKey, string[]> = {
      current_company: [],
      location: [],
      current_title: [],
      source: [],
    };
    for (const field of FILTER_FIELDS) {
      options[field.key] = uniqueSorted(candidates.map((c) => c[field.key]));
    }
    return options;
  }, [candidates]);

  const filteredCandidates = useMemo(() => {
    return candidates.filter((candidate) =>
      FILTER_FIELDS.every(({ key }) => {
        const filterValue = filters[key];
        return filterValue === ALL_FILTER || candidate[key] === filterValue;
      }),
    );
  }, [candidates, filters]);

  return (
    <div className="flex flex-col gap-6">
      {/* 1 & 2: Search Queries + Open SearXNG Search */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Search Queries</h2>
          <p className="text-sm text-slate-500">
            Open each query in SearXNG, then add anyone you find below.
          </p>
        </div>

        {initialQueries.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Save a search strategy before running candidate discovery.
            </p>
            <Link
              href={`/search/${jobId}/queries`}
              className="inline-flex w-fit items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              Go to Search Queries
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {initialQueries.map((query) => (
              <div
                key={query.id}
                className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <span className="inline-flex w-fit rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                    {query.query_type}
                  </span>
                  <p className="mt-1 break-all text-sm text-slate-700">{query.query_text}</p>
                </div>
                <a
                  href={searxngSearchUrl(query.query_text)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${linkButtonClass} w-fit shrink-0`}
                >
                  Open SearXNG Search
                </a>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3: Add / Import Candidate */}
      <section className="flex flex-col gap-3 border-t border-slate-100 pt-6">
        <h2 className="text-lg font-semibold text-slate-900">Add / Import Candidate</h2>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setAddMode((prev) => (prev === "manual" ? "none" : "manual"))}
          >
            {addMode === "manual" ? "Cancel" : "Add Candidate Manually"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setAddMode((prev) => (prev === "import" ? "none" : "import"))}
          >
            {addMode === "import" ? "Cancel" : "Import Candidate from URL"}
          </Button>
        </div>

        {addMode === "manual" && (
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Full Name"
                name="full_name"
                value={manualDraft.full_name}
                onChange={(e) => handleManualChange("full_name", e.target.value)}
                placeholder="Maria Santos"
              />
              <Input
                label="Current Job Title"
                name="current_title"
                value={manualDraft.current_title}
                onChange={(e) => handleManualChange("current_title", e.target.value)}
                placeholder="Finance Director"
              />
              <Input
                label="Current Company"
                name="current_company"
                value={manualDraft.current_company}
                onChange={(e) => handleManualChange("current_company", e.target.value)}
                placeholder="ABC Corporation"
              />
              <Input
                label="Location"
                name="location"
                value={manualDraft.location}
                onChange={(e) => handleManualChange("location", e.target.value)}
                placeholder="Philippines"
              />
              <Input
                label="Profile URL"
                name="profile_url"
                value={manualDraft.profile_url}
                onChange={(e) => handleManualChange("profile_url", e.target.value)}
                placeholder="https://linkedin.com/in/..."
                className="sm:col-span-2"
              />
            </div>
            {manualError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{manualError}</p>
            )}
            <Button
              type="button"
              onClick={handleAddCandidate}
              isLoading={isAdding}
              className="w-fit"
            >
              Save Candidate
            </Button>
          </div>
        )}

        {addMode === "import" && (
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">
              Paste a publicly accessible candidate profile URL. We&apos;ll try to read the
              name, title, and company from the page — review and correct anything before
              saving.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Input
                label="Profile URL"
                name="import_profile_url"
                value={importDraft.profile_url}
                onChange={(e) => handleImportChange("profile_url", e.target.value)}
                placeholder="https://example.com/in/jane-doe"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleExtract}
                isLoading={isExtracting}
                disabled={!importDraft.profile_url.trim()}
                className="w-fit"
              >
                Extract Details
              </Button>
            </div>

            {extractionNote && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {extractionNote}
              </p>
            )}

            {hasExtracted && (
              <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
                <Input
                  label="Full Name"
                  name="import_full_name"
                  value={importDraft.full_name}
                  onChange={(e) => handleImportChange("full_name", e.target.value)}
                  placeholder="Maria Santos"
                />
                <Input
                  label="Current Job Title"
                  name="import_current_title"
                  value={importDraft.current_title}
                  onChange={(e) => handleImportChange("current_title", e.target.value)}
                  placeholder="Finance Director"
                />
                <Input
                  label="Current Company"
                  name="import_current_company"
                  value={importDraft.current_company}
                  onChange={(e) => handleImportChange("current_company", e.target.value)}
                  placeholder="ABC Corporation"
                />
                <Input
                  label="Location"
                  name="import_location"
                  value={importDraft.location}
                  onChange={(e) => handleImportChange("location", e.target.value)}
                  placeholder="Philippines"
                />
                <Input
                  label="Source"
                  name="import_source"
                  value={importDraft.source}
                  onChange={(e) => handleImportChange("source", e.target.value)}
                  placeholder="LinkedIn Profile"
                  className="sm:col-span-2"
                />
              </div>
            )}

            {importError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{importError}</p>
            )}

            {hasExtracted && (
              <Button
                type="button"
                onClick={handleSaveImport}
                isLoading={isAdding}
                disabled={!importDraft.full_name.trim()}
                className="w-fit"
              >
                Save Candidate
              </Button>
            )}
          </div>
        )}
      </section>

      {/* 4: Discovered Candidates */}
      <section className="flex flex-col gap-3 border-t border-slate-100 pt-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Discovered Candidates</h2>
          <span className="text-sm text-slate-500">{candidates.length} saved</span>
        </div>

        {candidates.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FILTER_FIELDS.map(({ key, label }) => (
              <div key={key} className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">{label}</label>
                <select
                  value={filters[key]}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value={ALL_FILTER}>All</option>
                  {filterOptions[key].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {candidates.length === 0 && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
              No candidates yet. Open a search query above, then add or import who you find.
            </p>
          )}

          {candidates.length > 0 && filteredCandidates.length === 0 && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
              No candidates match the selected filters.
            </p>
          )}

          {filteredCandidates.map((candidate) => (
            <div
              key={candidate.id}
              className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-base font-semibold text-slate-900">{candidate.full_name}</p>
                  <p className="text-sm text-slate-600">
                    {candidate.current_title} · {candidate.current_company}
                  </p>
                  <p className="text-sm text-slate-500">{candidate.location}</p>
                </div>
                <span className="inline-flex w-fit shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  {candidate.source}
                </span>
              </div>
              {candidate.snippet && candidate.snippet !== "Not Found" && (
                <p className="line-clamp-2 text-sm text-slate-500">{candidate.snippet}</p>
              )}
              <Button
                type="button"
                variant="outline"
                className="w-fit px-3 py-1.5 text-xs"
                onClick={() => openSource(candidate)}
                disabled={!candidate.source_url && !candidate.profile_url}
              >
                Open Source
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* 5: Continue to AI Ranking */}
      <div className="border-t border-slate-100 pt-6">
        <Button
          type="button"
          onClick={handleContinue}
          isLoading={isContinuing}
          className="w-full sm:w-auto"
        >
          Continue to AI Ranking
        </Button>
      </div>
    </div>
  );
}
