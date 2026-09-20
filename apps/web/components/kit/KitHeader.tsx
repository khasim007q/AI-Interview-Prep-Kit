"use client";

import Link from "next/link";
import {
  Building2,
  Calendar,
  Layers,
  FileText,
  Play,
  Trash2,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import type { Kit } from "@ai-interview-prep/shared";

interface KitHeaderProps {
  kit: Kit;
  kitId: string;
  onStartPractice: () => void;
  onDeleteKit: () => void;
  isDeleting: boolean;
  regenNotice: string | null;
}

export function KitHeader({
  kit,
  kitId,
  onStartPractice,
  onDeleteKit,
  isDeleting,
  regenNotice,
}: KitHeaderProps) {
  return (
    <div className="bg-white border-b border-slate-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        {regenNotice && (
          <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 p-3.5 text-xs text-indigo-900 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-600 flex-shrink-0" />
            <span>{regenNotice}</span>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 border border-indigo-200">
                <Building2 className="h-3 w-3" />
                {kit.source.company}
              </span>
              <a
                href={kit.source.company_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 transition"
              >
                <span>{kit.source.company_url}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                Ready
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {kit.role.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <span>{kit.schedule.days_available} Day Plan</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Layers className="h-3.5 w-3.5 text-slate-400" />
                <span>{kit.questions.length} Questions</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <FileText className="h-3.5 w-3.5 text-slate-400" />
                <span>{kit.flashcards.length} Flashcards</span>
              </span>
              <span className="text-slate-400">
                Researched {new Date(kit.source.researched_at).toLocaleDateString()}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={onStartPractice}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition"
            >
              <Play className="h-4 w-4" />
              <span>Practice Flashcards</span>
            </button>
            <button
              onClick={onDeleteKit}
              disabled={isDeleting}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete Kit</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
