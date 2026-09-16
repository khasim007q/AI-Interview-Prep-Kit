import Link from "next/link";
import { Navbar } from "@/components/navbar";
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Calendar,
  Layers,
  Search,
  CheckCircle2,
  Cpu,
  RefreshCw,
  Flame,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-1.5 text-xs font-semibold text-indigo-700 border border-indigo-200 mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Autonomous Intelligence & Deterministic Sequencing</span>
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl max-w-4xl mx-auto leading-tight">
            Turn Any Job Posting & Company URL into an{" "}
            <span className="text-indigo-600">Interview Prep Workspace</span>
          </h1>

          <p className="mt-6 text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Our autonomous crawler researches the company and public interview discussions. Our
            deterministic engine guarantees 100% must-have requirement coverage and crafts an
            exact day-by-day study schedule.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/kits/new"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5 text-base font-semibold text-white shadow-md hover:bg-indigo-500 transition"
            >
              <span>Create Your Prep Kit</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/dashboard"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-base font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
            >
              <span>View Dashboard</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Architectural Division Feature Section */}
      <section className="py-16 bg-white border-y border-slate-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600 mb-2">
              Engineering Architecture
            </h2>
            <h3 className="text-3xl font-extrabold text-slate-900">
              Clear Separation of LLM Reasoning & Deterministic Code
            </h3>
            <p className="mt-3 text-slate-600 text-sm">
              We never entrust arithmetic, coverage decisions, or scheduling to stochastic prompts.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-indigo-50/60 rounded-2xl p-8 border border-indigo-100">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white mb-4">
                <Sparkles className="h-5 w-5" />
              </div>
              <h4 className="text-lg font-bold text-slate-900 mb-2">
                What the AI Model Owns
              </h4>
              <p className="text-xs text-slate-600 mb-4">
                Semantic reasoning where natural language understanding is essential:
              </p>
              <ul className="space-y-2 text-sm text-slate-700">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0" />
                  <span>Job requirement extraction & linguistic priority classification</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0" />
                  <span>Company brief & product intelligence synthesis</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0" />
                  <span>Categorized question generation (Technical, Design, Behavioural)</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0" />
                  <span>Active-recall flashcards with detailed answer outlines</span>
                </li>
              </ul>
            </div>

            <div className="bg-emerald-50/60 rounded-2xl p-8 border border-emerald-100">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-white mb-4">
                <Cpu className="h-5 w-5" />
              </div>
              <h4 className="text-lg font-bold text-slate-900 mb-2">
                What Deterministic Code Owns
              </h4>
              <p className="text-xs text-slate-600 mb-4">
                Zero hallucinations, verified arithmetic, and strict state boundaries:
              </p>
              <ul className="space-y-2 text-sm text-slate-700">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Deterministic requirement coverage analysis & second-pass loop</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Exact day-by-day study schedule allocation (1 to 60 days)</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Preservation of edited/pinned user content during regeneration</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>SSRF guard, robots.txt compliance, and bounded web crawling</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="py-20 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <Search className="h-8 w-8 text-indigo-600 mb-4" />
              <h4 className="text-base font-bold text-slate-900">Semantic Web Crawler</h4>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Scores internal links to discover hiring, about, and culture pages dynamically
                without fragile hardcoded paths.
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <RefreshCw className="h-8 w-8 text-indigo-600 mb-4" />
              <h4 className="text-base font-bold text-slate-900">Edit-Preserving Regeneration</h4>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Regenerate specific categories or sections at will. Pinned and edited questions
                are protected and never overwritten.
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <Flame className="h-8 w-8 text-rose-500 mb-4" />
              <h4 className="text-base font-bold text-slate-900">Weak Spots Diagnostic</h4>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Interactive flashcard practice records confidence from 1 to 5, generating a
                diagnostic report prioritizing what needs work.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-500">
          <p>
            AI Interview Prep Kit — Built for Trao Full-Stack Engineering Assessment
            (FS-AI-INTERVIEW-01)
          </p>
        </div>
      </footer>
    </div>
  );
}
