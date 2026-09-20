"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { apiClient, ApiError } from "@/lib/api-client";
import { Sparkles, Calendar, Globe, FileText, ArrowRight, Loader2 } from "lucide-react";

export default function NewKitPage() {
  const router = useRouter();
  const [jd, setJd] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [days, setDays] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (jd.trim().length === 0) {
      setError("Please provide a job description.");
      return;
    }

    if (!companyUrl.startsWith("http://") && !companyUrl.startsWith("https://")) {
      setError("Company URL must begin with http:// or https://");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await apiClient<{ id: string }>("/kits", {
        method: "POST",
        body: JSON.stringify({
          jd: jd.trim(),
          company_url: companyUrl.trim(),
          days: Number(days),
        }),
      });

      router.push(`/kits/${response.id}`);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to create generation job. Please check your inputs.");
      }
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl flex items-center gap-2.5">
            <Sparkles className="h-7 w-7 text-indigo-600" />
            <span>Create Interview Prep Kit</span>
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Our autonomous pipeline will research the company website, extract explicit JD requirements, generate categorized questions, and construct a deterministic study schedule.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <label htmlFor="companyUrl" className="block text-sm font-semibold text-slate-900 mb-1.5 flex items-center gap-1.5">
              <Globe className="h-4 w-4 text-indigo-600" />
              <span>Company Website URL</span>
            </label>
            <input
              id="companyUrl"
              type="url"
              required
              value={companyUrl}
              onChange={(e) => setCompanyUrl(e.target.value)}
              placeholder="https://example.com"
              className="block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">
              The crawler will discover hiring pages, culture notes, and public interview discussions.
            </p>
          </div>

          <div>
            <label htmlFor="days" className="block text-sm font-semibold text-slate-900 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-indigo-600" />
                <span>Days Until Interview</span>
              </span>
              <span className="text-indigo-600 font-bold text-base">{days} Days</span>
            </label>
            <input
              id="days"
              type="range"
              min="1"
              max="60"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>1 Day (Intensive)</span>
              <span>14 Days (Standard)</span>
              <span>60 Days (Comprehensive)</span>
            </div>
          </div>

          <div>
            <label htmlFor="jd" className="block text-sm font-semibold text-slate-900 mb-1.5 flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-indigo-600" />
              <span>Job Description</span>
            </label>
            <textarea
              id="jd"
              required
              rows={10}
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste the complete job description text here, including role summary, responsibilities, and qualifications..."
              className="block w-full rounded-lg border border-slate-300 p-3.5 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm font-mono leading-relaxed"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>Characters: {jd.length}</span>
              <span>Min required: 50 characters</span>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5 text-base font-semibold text-white shadow-md hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-60 transition"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Launching Research Pipeline...</span>
                </>
              ) : (
                <>
                  <span>Generate Interview Prep Kit</span>
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
