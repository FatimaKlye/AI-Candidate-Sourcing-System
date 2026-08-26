const candidates = [
  { label: "Candidate A", role: "Senior Backend Engineer", score: 92 },
  { label: "Candidate B", role: "Product Designer", score: 87 },
  { label: "Candidate C", role: "Data Analyst", score: 74 },
];

export function DashboardPreview() {
  return (
    <div className="relative">
      <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-br from-indigo-100 via-white to-transparent blur-2xl" />
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Job Description
          </p>
          <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            Senior Backend Engineer — 5+ yrs, distributed systems, Go/Node, AWS
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between rounded-lg bg-indigo-50 px-3 py-2">
          <span className="text-sm font-medium text-indigo-700">
            Candidate Match
          </span>
          <span className="text-sm font-semibold text-indigo-700">
            3 found
          </span>
        </div>

        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Candidate Ranking
          </p>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Match Score
          </span>
        </div>

        <ul className="flex flex-col gap-3">
          {candidates.map((candidate, index) => (
            <li
              key={candidate.label}
              className="flex items-center gap-3 rounded-xl border border-slate-100 p-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-600">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {candidate.label}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {candidate.role}
                </p>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100">
                  <div
                    className="h-1.5 rounded-full bg-indigo-500"
                    style={{ width: `${candidate.score}%` }}
                  />
                </div>
              </div>
              <span className="text-sm font-semibold text-slate-900">
                {candidate.score}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
