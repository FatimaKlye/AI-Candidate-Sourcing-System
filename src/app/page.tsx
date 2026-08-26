import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />
      <main className="flex-1">
        <Hero />
      </main>
      <footer className="border-t border-slate-200 px-6 py-6 text-center text-sm text-slate-400">
        © {new Date().getFullYear()} TalentAI. All rights reserved.
      </footer>
    </div>
  );
}
