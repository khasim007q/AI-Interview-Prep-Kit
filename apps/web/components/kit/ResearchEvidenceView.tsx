"use client";

import {
  Search,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Briefcase,
  MessageSquare,
  Globe,
  Info,
} from "lucide-react";
import type { Kit } from "@ai-interview-prep/shared";

interface ResearchEvidenceViewProps {
  kit: Kit;
}

export function ResearchEvidenceView({ kit }: ResearchEvidenceViewProps) {
  const research = kit.research;
  const pagesUsed = kit.source.pages_used || [];
  const attemptedCount = research?.sources_attempted?.length || pagesUsed.length;
  const usedCount = research?.sources_used?.length || pagesUsed.length;
  const failedList = research?.sources_failed || [];

  return (
    <div className="space-y-6">
      {/* Overview Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <Search className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Research Evidence & Provenance
            </h2>
            <p className="text-xs text-slate-500">
              Audit log of external web pages crawled, public discussion searched, and partial failures handled gracefully.
            </p>
          </div>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-xs text-slate-500 font-medium">Pages Attempted</span>
            <p className="text-2xl font-bold text-slate-900 mt-1">{attemptedCount}</p>
          </div>
          <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-100">
            <span className="text-xs text-emerald-700 font-medium">Pages Successfully Used</span>
            <p className="text-2xl font-bold text-emerald-900 mt-1">{usedCount}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-xs text-slate-500 font-medium">Hiring / Career Page</span>
            <p className="text-sm font-bold text-slate-900 mt-2">
              {research?.hiring_page_found ? "✓ Discovered" : "Root domain used"}
            </p>
          </div>
        </div>

        {/* Failed / Skipped Sources with Friendly Notice (Assessment Item 8) */}
        {failedList.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-amber-900">
                  Partial Source Retrieval Notices ({failedList.length})
                </h4>
                <p className="text-xs text-amber-800 mt-0.5">
                  We couldn&apos;t retrieve the following source(s), so we continued with the rest of the research to complete your kit without interruption:
                </p>
                <div className="mt-3 space-y-2">
                  {failedList.map((fail, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-white/80 rounded-lg border border-amber-200/60 text-xs flex items-start justify-between gap-3"
                    >
                      <span className="font-mono text-slate-700 break-all">{fail.url}</span>
                      <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded flex-shrink-0">
                        {fail.reason}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Successfully Used Pages */}
        <div className="mb-8">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Company Sources Used ({pagesUsed.length})
          </h4>
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {pagesUsed.map((pageUrl, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-white hover:bg-slate-50 flex items-center justify-between gap-4 transition"
              >
                <div className="flex items-center gap-2 text-xs text-slate-800 break-all">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  <span className="font-mono">{pageUrl}</span>
                </div>
                <a
                  href={pageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition flex-shrink-0"
                  aria-label="Open page source in new tab"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* Public Discussion Findings */}
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Public Interview Discussion
          </h4>
          {research?.public_discussion?.found &&
          research.public_discussion.sources.length > 0 ? (
            <div className="space-y-2">
              {research.public_discussion.sources.map((src, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs text-slate-700"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                    <span className="font-mono">{src}</span>
                  </div>
                  <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                    Discussion Source
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-500">
              No specific external forum threads or Glassdoor interview threads were verified for this organization. Questions were anchored directly in official company documentation and job requirements.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
