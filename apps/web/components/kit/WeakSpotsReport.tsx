"use client";

import { AlertCircle, CheckCircle2, Flame, Award, BookOpen } from "lucide-react";
import type { Kit, PracticeSummary } from "@ai-interview-prep/shared";

interface WeakSpotsReportProps {
  kit: Kit;
  practiceSummary?: PracticeSummary;
}

export function WeakSpotsReport({ kit, practiceSummary }: WeakSpotsReportProps) {
  const requirements = kit.role.requirements;
  const questions = kit.questions;

  // Calculate covered requirements
  const coveredSet = new Set<string>();
  for (const q of questions) {
    for (const rId of q.requirement_ids || []) {
      coveredSet.add(rId);
    }
  }

  const mustReqs = requirements.filter((r) => r.priority === "must");
  const niceReqs = requirements.filter((r) => r.priority === "nice");

  const mustCovered = mustReqs.filter((r) => coveredSet.has(r.id));
  const mustUncovered = mustReqs.filter((r) => !coveredSet.has(r.id));
  const niceUncovered = niceReqs.filter((r) => !coveredSet.has(r.id));

  // Category counts
  const categoryCounts = {
    technical: questions.filter((q) => q.category === "technical").length,
    "system-design": questions.filter((q) => q.category === "system-design").length,
    behavioural: questions.filter((q) => q.category === "behavioural").length,
    "company-fit": questions.filter((q) => q.category === "company-fit").length,
  };

  const totalQuestions = questions.length || 1;

  return (
    <div className="space-y-6">
      {/* Header Diagnostic Summary */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
            <Flame className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Weak Spots Diagnostic Report
            </h2>
            <p className="text-xs text-slate-500">
              Algorithmic gap analysis across requirements, question balance, and retention.
            </p>
          </div>
        </div>

        {/* Status Callout */}
        {mustUncovered.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 mb-6 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-emerald-900">
                100% Must-Have Requirement Coverage Achieved
              </h4>
              <p className="text-xs text-emerald-800 mt-0.5">
                Every mandatory role requirement has at least one dedicated question mapped to it.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-rose-900">
                Coverage Alert: {mustUncovered.length} Must-Have Requirement(s) Uncovered
              </h4>
              <p className="text-xs text-rose-800 mt-0.5">
                Add questions targeting these requirements before your interview.
              </p>
            </div>
          </div>
        )}

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-xs text-slate-500 font-medium">Must-Have Coverage</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-900">
                {mustReqs.length > 0
                  ? `${Math.round((mustCovered.length / mustReqs.length) * 100)}%`
                  : "N/A"}
              </span>
              <span className="text-xs text-slate-500">
                ({mustCovered.length}/{mustReqs.length} reqs)
              </span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-xs text-slate-500 font-medium">Question Bank Size</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-900">{questions.length}</span>
              <span className="text-xs text-slate-500">questions</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-xs text-slate-500 font-medium">Flashcard Mastery</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-900">
                {practiceSummary && practiceSummary.totalFlashcards > 0
                  ? `${Math.round(
                      (((practiceSummary.confidenceDistribution?.["5"] || 0) +
                        (practiceSummary.confidenceDistribution?.["4"] || 0)) /
                        practiceSummary.totalFlashcards) *
                        100
                    )}%`
                  : "0%"}
              </span>
              <span className="text-xs text-slate-500">
                ({(practiceSummary?.confidenceDistribution?.["5"] || 0) +
                  (practiceSummary?.confidenceDistribution?.["4"] || 0)}{" "}
                mastered)
              </span>
            </div>
          </div>
        </div>

        {/* Category Balance Breakdown */}
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Question Category Distribution
          </h4>
          <div className="space-y-3">
            {[
              { label: "Technical", count: categoryCounts.technical, color: "bg-indigo-600" },
              {
                label: "System Design",
                count: categoryCounts["system-design"],
                color: "bg-cyan-600",
              },
              {
                label: "Behavioural",
                count: categoryCounts.behavioural,
                color: "bg-emerald-600",
              },
              {
                label: "Company Fit",
                count: categoryCounts["company-fit"],
                color: "bg-amber-500",
              },
            ].map((cat) => {
              const pct = Math.round((cat.count / totalQuestions) * 100);
              return (
                <div key={cat.label}>
                  <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                    <span>{cat.label}</span>
                    <span>
                      {cat.count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${cat.color} transition-all duration-300`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Uncovered Requirements List */}
        {(mustUncovered.length > 0 || niceUncovered.length > 0) && (
          <div className="mt-8 pt-6 border-t border-slate-100">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Uncovered Requirements List
            </h4>
            <div className="space-y-2">
              {mustUncovered.map((r) => (
                <div
                  key={r.id}
                  className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-xs text-rose-900"
                >
                  <span className="font-mono font-bold">{r.id}: {r.text}</span>
                  <span className="font-semibold uppercase text-rose-700 bg-white px-2 py-0.5 rounded">
                    Must Have
                  </span>
                </div>
              ))}
              {niceUncovered.map((r) => (
                <div
                  key={r.id}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs text-slate-700"
                >
                  <span className="font-mono font-bold">{r.id}: {r.text}</span>
                  <span className="text-slate-500 bg-white px-2 py-0.5 rounded">
                    Nice to have
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
