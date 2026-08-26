import Link from "next/link";

export interface MatchListItem {
  id: string;
  overall_score: number;
  review_status: string;
  shortlisted: boolean;
  created_at: string;
  candidates: {
    id: string;
    full_name: string;
    current_title: string;
    current_company: string;
    location: string;
    source: string;
    skills: string[];
  } | null;
  jobs: { id: string; search_name: string } | null;
}

export function MatchTable({ matches, emptyMessage }: { matches: MatchListItem[]; emptyMessage: string }) {
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Candidate</th><th className="px-5 py-3">Requisition</th><th className="px-5 py-3">Location</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Match</th></tr></thead><tbody className="divide-y divide-slate-100">{matches.map((match) => match.candidates && <tr key={match.id} className="hover:bg-slate-50"><td className="px-5 py-4"><Link href={`/candidates/${match.candidates.id}`} className="font-medium text-slate-900 hover:text-cyan-700">{match.candidates.full_name}</Link><p className="mt-1 text-xs text-slate-400">{match.candidates.current_title} · {match.candidates.current_company}</p></td><td className="px-5 py-4 text-sm text-slate-600">{match.jobs ? <Link href={`/requisitions/${match.jobs.id}`} className="hover:text-cyan-700">{match.jobs.search_name}</Link> : "—"}</td><td className="px-5 py-4 text-sm text-slate-600">{match.candidates.location}</td><td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{match.review_status}</span></td><td className="px-5 py-4 text-right text-lg font-semibold text-emerald-600">{match.overall_score}%</td></tr>)}{matches.length === 0 && <tr><td colSpan={5} className="px-5 py-14 text-center text-sm text-slate-500">{emptyMessage}</td></tr>}</tbody></table></div></div>;
}
