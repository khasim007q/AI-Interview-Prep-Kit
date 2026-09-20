"use client";

import { Building2, Briefcase, RefreshCw, Loader2, Tag, ExternalLink } from "lucide-react";
import type { Kit } from "@ai-interview-prep/shared";

interface OverviewTabProps {
  kit: Kit;
  onRegenerateBrief: () => void;
  isRegeneratingBrief: boolean;
}

export function OverviewTab({
  kit,
  onRegenerateBrief,
  isRegeneratingBrief,
}: OverviewTabProps) {
  return (
    <div className="space-y-8">
      {/* Company Brief Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Company Brief</h2>
              <p className="text-xs text-slate-500">
                Researched from official website and public discussion
              </p>
            </div>
          </div>
          <button
            onClick={onRegenerateBrief}
            disabled={isRegeneratingBrief}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
          >
            {isRegeneratingBrief ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
            )}
            <span>Regenerate Brief</span>
          </button>
        </div>

        <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Overview & Culture
            </h4>
            <p className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              {kit.company_brief.summary}
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              What They Do
            </h4>
            <p className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              {kit.company_brief.what_they_do}
            </p>
          </div>

          {kit.company_brief.sources.length > 0 && (
            <div className="pt-2">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Grounding Sources
              </h4>
              <div className="flex flex-wrap gap-2">
                {kit.company_brief.sources.map((src, idx) => (
                  <a
                    key={idx}
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition"
                  >
                    <span>{src}</span>
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Role & Requirements Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <Briefcase className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Role & Requirements</h2>
            <p className="text-xs text-slate-500">
              Extracted from job posting ({kit.source.jd_chars} characters)
            </p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-xs text-slate-500 font-medium">Job Title</span>
            <p className="text-sm font-bold text-slate-900 mt-0.5">{kit.role.title}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-xs text-slate-500 font-medium">Seniority Level</span>
            <p className="text-sm font-bold text-slate-900 mt-0.5">{kit.role.seniority}</p>
          </div>
        </div>

        {kit.role.responsibilities.length > 0 && (
          <div className="mb-6">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Key Responsibilities
            </h4>
            <ul className="space-y-1.5 list-disc list-inside text-sm text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-100">
              {kit.role.responsibilities.map((resp, idx) => (
                <li key={idx} className="leading-normal">
                  {resp}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Explicit Requirements ({kit.role.requirements.length})
          </h4>
          {kit.role.requirements.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-500">
              No explicit bulleted requirements were extracted from this brief posting. Questions were constructed from role foundations.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {kit.role.requirements.map((req) => (
                <div
                  key={req.id}
                  className="p-3.5 bg-white hover:bg-slate-50 flex items-start justify-between gap-4 transition"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded flex-shrink-0 mt-0.5">
                      {req.id}
                    </span>
                    <p className="text-sm text-slate-900">{req.text}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        req.priority === "must"
                          ? "bg-rose-50 text-rose-700 border border-rose-200"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {req.priority.toUpperCase()}
                    </span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 capitalize">
                      {req.kind}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
