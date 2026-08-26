import Link from "next/link";
import { ReactNode } from "react";
import { SignOutButton } from "@/components/dashboard/SignOutButton";

const navigation = [
  ["Dashboard", "/dashboard"],
  ["Job Requisitions", "/requisitions"],
  ["Matched Applicants", "/matched-applicants"],
  ["Shortlisted", "/shortlisted"],
  ["Candidate Pool", "/candidate-pool"],
  ["Activity", "/activity"],
  ["Settings", "/settings"],
] as const;

interface AppShellProps {
  workspaceName: string;
  displayName: string;
  children: ReactNode;
}

export function AppShell({ workspaceName, displayName, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-slate-950 px-4 py-5 text-white lg:flex lg:flex-col">
        <Link href="/dashboard" className="px-3 text-xl font-bold tracking-tight">
          Talent<span className="text-cyan-400">AI</span>
        </Link>
        <p className="mt-1 truncate px-3 text-xs text-slate-400">{workspaceName}</p>
        <nav className="mt-8 flex flex-1 flex-col gap-1" aria-label="Main navigation">
          {navigation.map(([label, href]) => (
            <Link key={href} href={href} className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white">
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/10 px-3 pt-4">
          <p className="truncate text-sm font-medium text-white">{displayName}</p>
          <div className="mt-2"><SignOutButton /></div>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <Link href="/dashboard" className="text-lg font-bold text-slate-950 lg:hidden">Talent<span className="text-cyan-600">AI</span></Link>
            <nav className="flex flex-1 gap-1 overflow-x-auto lg:hidden" aria-label="Mobile navigation">
              {navigation.slice(0, 4).map(([label, href]) => <Link key={href} href={href} className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">{label}</Link>)}
            </nav>
            <div className="hidden text-sm text-slate-500 lg:block">Private HR workspace</div>
          </div>
        </header>
        <main className="px-4 py-7 sm:px-6 lg:px-8 lg:py-9">{children}</main>
      </div>
    </div>
  );
}
