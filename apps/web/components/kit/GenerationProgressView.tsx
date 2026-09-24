"use client";

import Link from "next/link";
import { Sparkles, AlertCircle, RefreshCw } from "lucide-react";

interface GenerationProgressViewProps {
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  generation: {
    stage: string;
    progress: number;
    message?: string;
    error?: { code: string; message: string } | null;
  };
  onRetry?: () => void;
}

export function GenerationProgressView({
  status,
  generation,
  onRetry,
}: GenerationProgressViewProps) {
  if (status === "failed" || status === "cancelled") {
    const isCancelled = status === "cancelled";
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className={`mx-auto max-w-lg w-full bg-white rounded-2xl border ${isCancelled ? "border-amber-200" : "border-red-200"} p-8 shadow-sm text-center`}>
          <AlertCircle className={`h-12 w-12 ${isCancelled ? "text-amber-500" : "text-red-500"} mx-auto mb-4`} />
          <h2 className="text-xl font-bold text-slate-900">
            {isCancelled ? "Kit Generation Cancelled" : "Kit Generation Failed"}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {generation.error?.message ||
              generation.message ||
              (isCancelled ? "The generation job was cancelled." : "The research or generation pipeline encountered an error.")}
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            {onRetry && (
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Try Again</span>
              </button>
            )}
            <Link
              href="/dashboard"
              className="inline-block rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="mx-auto max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 mb-4 animate-pulse">
          <Sparkles className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Building Preparation Kit...</h2>
        <p className="mt-1 text-xs text-slate-500">
          Our autonomous pipeline is crawling the company website and synthesizing interview questions.
        </p>

        {/* Progress Bar */}
        <div className="mt-6">
          <div className="flex justify-between text-xs text-slate-500 font-medium mb-2">
            <span className="capitalize">{generation.stage.replace(/_/g, " ")}</span>
            <span>{generation.progress}%</span>
          </div>
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 transition-all duration-500"
              style={{ width: `${Math.max(5, generation.progress)}%` }}
            />
          </div>
        </div>

        {generation.message && (
          <p className="mt-4 text-xs text-slate-600 font-medium bg-slate-50 p-2.5 rounded-lg border border-slate-100">
            {generation.message}
          </p>
        )}
      </div>
    </div>
  );
}
