import Link from "next/link";
import { DashboardPreview } from "@/components/landing/DashboardPreview";

export function Hero() {
  return (
    <section className="mx-auto grid max-w-7xl gap-12 px-6 py-16 md:py-24 lg:grid-cols-2 lg:items-center">
      <div>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Find the right candidates faster with AI.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-slate-600">
          Upload a job description and let AI help you discover, analyze, and
          rank relevant candidates.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            href="/register"
            className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            Get Started
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          >
            Login
          </Link>
        </div>
      </div>
      <DashboardPreview />
    </section>
  );
}
