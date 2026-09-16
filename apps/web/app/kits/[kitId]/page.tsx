"use client";

import { use, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { apiClient, ApiError } from "@/lib/api-client";
import {
  Sparkles,
  Building2,
  Briefcase,
  HelpCircle,
  Layers,
  Calendar,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Pin,
  Trash2,
  Edit3,
  Plus,
  Play,
  Flame,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Tag,
  Save,
} from "lucide-react";
import type {
  Kit,
  Question,
  Flashcard,
  QuestionCategory,
  PracticeSummary,
} from "@ai-interview-prep/shared";

interface KitResponse {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  input: { jd: string; company_url: string; days: number };
  kit: Kit | null;
  generation: {
    stage: string;
    progress: number;
    message?: string;
    error?: { code: string; message: string } | null;
  };
  version: number;
}

export default function KitDetailPage({
  params,
}: {
  params: Promise<{ kitId: string }>;
}) {
  const resolvedParams = use(params);
  const kitId = resolvedParams.kitId;
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<
    "overview" | "role" | "questions" | "flashcards" | "schedule" | "weakspots" | "research"
  >("overview");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editedPrompt, setEditedPrompt] = useState("");
  const [editedOutline, setEditedOutline] = useState("");

  // Practice Mode State
  const [isPracticing, setIsPracticing] = useState(false);
  const [practiceCards, setPracticeCards] = useState<Flashcard[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Regeneration notification message
  const [regenNotice, setRegenNotice] = useState<string | null>(null);

  // Query Kit
  const { data, isLoading, error } = useQuery<KitResponse>({
    queryKey: ["kit", kitId],
    queryFn: () => apiClient(`/kits/${kitId}`),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "running" || status === "queued" ? 1500 : false;
    },
  });

  // Query Practice Summary
  const { data: practiceData, refetch: refetchPractice } = useQuery<{
    summary: PracticeSummary;
  }>({
    queryKey: ["practice-summary", kitId],
    queryFn: () => apiClient(`/kits/${kitId}/practice/summary`),
    enabled: data?.status === "completed",
  });

  // Mutations
  const updateQuestionMutation = useMutation({
    mutationFn: ({
      questionId,
      patch,
    }: {
      questionId: string;
      patch: Partial<Question>;
    }) =>
      apiClient(`/kits/${kitId}/questions/${questionId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kit", kitId] });
      setEditingQuestionId(null);
    },
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: (questionId: string) =>
      apiClient(`/kits/${kitId}/questions/${questionId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kit", kitId] });
    },
  });

  const regenerateCategoryMutation = useMutation({
    mutationFn: (category: QuestionCategory) =>
      apiClient<{ message: string; preservedCount: number; newCount: number }>(
        `/kits/${kitId}/regenerate/questions/${category}`,
        { method: "POST" }
      ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["kit", kitId] });
      setRegenNotice(res.message);
      setTimeout(() => setRegenNotice(null), 8000);
    },
  });

  const regenerateBriefMutation = useMutation({
    mutationFn: () =>
      apiClient(`/kits/${kitId}/regenerate/company-brief`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kit", kitId] });
      setRegenNotice("Company brief regenerated successfully.");
      setTimeout(() => setRegenNotice(null), 5000);
    },
  });

  const regenerateScheduleMutation = useMutation({
    mutationFn: () =>
      apiClient(`/kits/${kitId}/regenerate/schedule`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kit", kitId] });
      setRegenNotice("Schedule recalculated based on latest questions.");
      setTimeout(() => setRegenNotice(null), 5000);
    },
  });

  const recordAttemptMutation = useMutation({
    mutationFn: ({
      flashcardId,
      confidence,
    }: {
      flashcardId: string;
      confidence: number;
    }) =>
      apiClient(`/kits/${kitId}/practice/attempts`, {
        method: "POST",
        body: JSON.stringify({ flashcardId, confidence }),
      }),
    onSuccess: () => {
      refetchPractice();
    },
  });

  const toggleExpand = (qId: string) => {
    const next = new Set(expandedQuestions);
    if (next.has(qId)) next.delete(qId);
    else next.add(qId);
    setExpandedQuestions(next);
  };

  const startPractice = async () => {
    try {
      const res = await apiClient<{ cards: Flashcard[] }>(
        `/kits/${kitId}/practice/cards`
      );
      if (res.cards.length > 0) {
        setPracticeCards(res.cards);
        setCurrentCardIndex(0);
        setIsFlipped(false);
        setIsPracticing(true);
      }
    } catch {
      // fallback to kit flashcards
      if (data?.kit?.flashcards && data.kit.flashcards.length > 0) {
        setPracticeCards(data.kit.flashcards);
        setCurrentCardIndex(0);
        setIsFlipped(false);
        setIsPracticing(true);
      }
    }
  };

  const handleConfidenceRating = (confidence: number) => {
    if (practiceCards.length === 0) return;
    const card = practiceCards[currentCardIndex];
    recordAttemptMutation.mutate({ flashcardId: card.id, confidence });

    if (currentCardIndex + 1 < practiceCards.length) {
      setCurrentCardIndex((prev) => prev + 1);
      setIsFlipped(false);
    } else {
      setIsPracticing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <div className="mx-auto max-w-md my-auto p-6 bg-white rounded-2xl border border-red-200 shadow-sm text-center">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-900">Kit Not Found</h2>
          <p className="text-sm text-slate-600 mt-1">
            This prep kit could not be loaded or you may not have permission to view it.
          </p>
          <Link
            href="/dashboard"
            className="mt-5 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // IN-PROGRESS GENERATION VIEW
  // --------------------------------------------------------------------------
  if (data.status === "running" || data.status === "queued") {
    const STAGES = [
      { id: "validation", label: "Validating input parameters" },
      { id: "extracting_requirements", label: "Extracting explicit JD requirements" },
      { id: "crawling_company", label: "Crawling company website" },
      { id: "researching_discussion", label: "Researching public interview discussions" },
      { id: "generating_brief", label: "Building company brief & culture analysis" },
      { id: "generating_questions", label: "Generating category-specific interview questions" },
      { id: "checking_coverage", label: "Evaluating coverage & running targeted second pass" },
      { id: "generating_flashcards", label: "Generating active-recall flashcards" },
      { id: "building_schedule", label: "Allocating deterministic day-by-day schedule" },
      { id: "validating_kit", label: "Validating final schema & reference integrity" },
    ];

    const currentStageIndex = STAGES.findIndex((s) => s.id === data.generation.stage);

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 mb-4">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              Generating Your Prep Kit
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Autonomous research and deterministic allocation pipeline is executing.
            </p>

            <div className="mt-6 mb-8">
              <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1.5">
                <span>Overall Progress</span>
                <span>{data.generation.progress}%</span>
              </div>
              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 transition-all duration-500"
                  style={{ width: `${data.generation.progress}%` }}
                />
              </div>
              <p className="text-xs text-indigo-600 font-medium mt-2">
                {data.generation.message || "Working..."}
              </p>
            </div>

            <div className="border-t border-slate-100 pt-6 text-left">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
                Pipeline Stages
              </h3>
              <div className="space-y-3">
                {STAGES.map((s, idx) => {
                  const isDone = currentStageIndex > idx || data.generation.progress >= (idx + 1) * 10;
                  const isCurrent = currentStageIndex === idx;

                  return (
                    <div key={s.id} className="flex items-center gap-3 text-sm">
                      {isDone ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      ) : isCurrent ? (
                        <Loader2 className="h-4 w-4 text-indigo-600 animate-spin shrink-0" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border border-slate-300 shrink-0" />
                      )}
                      <span
                        className={`${
                          isDone
                            ? "text-slate-700 font-medium"
                            : isCurrent
                            ? "text-indigo-600 font-semibold"
                            : "text-slate-400"
                        }`}
                      >
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // FAILED GENERATION VIEW
  // --------------------------------------------------------------------------
  if (data.status === "failed") {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <main className="mx-auto w-full max-w-lg flex-1 px-4 py-16">
          <div className="bg-white rounded-2xl border border-red-200 p-8 shadow-sm text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-slate-900">Generation Failed</h1>
            <p className="text-sm text-slate-600 mt-2">
              {data.generation.error?.message ||
                "The pipeline could not produce a kit with the supplied inputs."}
            </p>
            <div className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700 font-mono">
              Error Code: {data.generation.error?.code || "PIPELINE_ERROR"}
            </div>
            <div className="mt-6 flex justify-center gap-3">
              <Link
                href="/kits/new"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                Try Again with Different Inputs
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const kit = data.kit!;

  // Filtered Questions
  const filteredQuestions =
    selectedCategory === "all"
      ? kit.questions
      : kit.questions.filter((q) => q.category === selectedCategory);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      {/* Regeneration Notice Toast */}
      {regenNotice && (
        <div className="sticky top-14 z-40 bg-indigo-600 text-white px-4 py-2.5 text-center text-xs font-medium shadow-md">
          {regenNotice}
        </div>
      )}

      {/* Main Workspace Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="h-3 w-3" />
                <span>Kit v{data.version}</span>
              </span>
              <span className="text-xs text-slate-500">
                {kit.schedule.days_available} Days Prep Plan
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
              {kit.role.title}
            </h1>
            <p className="text-sm font-medium text-slate-600 flex items-center gap-1.5 mt-0.5">
              <Building2 className="h-4 w-4 text-slate-400" />
              <span>{kit.source.company}</span>
              <span className="text-slate-300">•</span>
              <a
                href={kit.source.company_url}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 hover:underline inline-flex items-center gap-1"
              >
                <span>{kit.source.company_url}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={startPractice}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 transition"
            >
              <Play className="h-4 w-4" />
              <span>Launch Practice</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex overflow-x-auto border-t border-slate-100">
          {[
            { id: "overview", label: "Company Brief", icon: Building2 },
            { id: "role", label: "Role & Requirements", icon: Briefcase },
            { id: "questions", label: `Questions (${kit.questions.length})`, icon: HelpCircle },
            { id: "flashcards", label: `Flashcards (${kit.flashcards.length})`, icon: Layers },
            { id: "schedule", label: `Schedule (${kit.schedule.days_available}d)`, icon: Calendar },
            { id: "weakspots", label: "Weak Spots Report", icon: Flame },
            { id: "research", label: "Research Evidence", icon: Search },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold whitespace-nowrap transition ${
                  isActive
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Workspace Content */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {/* TAB 1: COMPANY BRIEF */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-900">Company Intelligence</h2>
              <button
                onClick={() => regenerateBriefMutation.mutate()}
                disabled={regenerateBriefMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${
                    regenerateBriefMutation.isPending ? "animate-spin" : ""
                  }`}
                />
                <span>Regenerate Brief</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-600 mb-2">
                  Summary & Culture
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                  {kit.company_brief.summary}
                </p>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-600 mb-2">
                  What They Do & Product
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                  {kit.company_brief.what_they_do}
                </p>

                <div className="mt-6 pt-4 border-t border-slate-100">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">
                    Research Sources Grounded
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {kit.company_brief.sources.map((s, idx) => (
                      <a
                        key={idx}
                        href={s}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition"
                      >
                        <span className="truncate max-w-[200px]">{s}</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ROLE & REQUIREMENTS */}
        {activeTab === "role" && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900 mb-1">
                {kit.role.title} ({kit.role.seniority} Level)
              </h2>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mt-4 mb-2">
                Key Responsibilities
              </h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-slate-700">
                {kit.role.responsibilities.map((resp, i) => (
                  <li key={i}>{resp}</li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900 mb-3">
                Extracted Requirements ({kit.role.requirements.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {kit.role.requirements.map((req) => (
                  <div
                    key={req.id}
                    className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          {req.id}
                        </span>
                        <span
                          className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${
                            req.priority === "must"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : "bg-sky-50 text-sky-700 border border-sky-200"
                          }`}
                        >
                          {req.priority}
                        </span>
                        <span className="text-xs text-slate-500 capitalize bg-slate-100 px-2 py-0.5 rounded">
                          {req.kind}
                        </span>
                      </div>
                      <p className="text-sm text-slate-800 font-medium">{req.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: QUESTION BANK (BUILDER) */}
        {activeTab === "questions" && (
          <div className="space-y-6">
            {/* Category Filter & Regeneration Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex flex-wrap gap-2">
                {["all", "technical", "system-design", "behavioural", "company-fit"].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold capitalize transition ${
                      selectedCategory === cat
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {selectedCategory !== "all" && (
                <button
                  onClick={() =>
                    regenerateCategoryMutation.mutate(selectedCategory as QuestionCategory)
                  }
                  disabled={regenerateCategoryMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  title="Preserves your edited and pinned questions!"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${
                      regenerateCategoryMutation.isPending ? "animate-spin" : ""
                    }`}
                  />
                  <span>Regenerate {selectedCategory} Questions</span>
                </button>
              )}
            </div>

            {/* Questions List */}
            <div className="space-y-4">
              {filteredQuestions.map((q) => {
                const isExpanded = expandedQuestions.has(q.id);
                const isEditing = editingQuestionId === q.id;
                const isPinned = (q as any).metadata?.pinned || false;

                return (
                  <div
                    key={q.id}
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm transition hover:border-indigo-200"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            {q.id}
                          </span>
                          <span className="text-xs font-semibold capitalize bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-0.5 rounded-full">
                            {q.category}
                          </span>
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded ${
                              q.difficulty === 3
                                ? "bg-red-50 text-red-700"
                                : q.difficulty === 2
                                ? "bg-amber-50 text-amber-700"
                                : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            Diff {q.difficulty}
                          </span>
                          {q.requirement_ids.map((rId) => (
                            <span
                              key={rId}
                              className="text-xs font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded"
                            >
                              [{rId}]
                            </span>
                          ))}
                        </div>

                        {isEditing ? (
                          <div className="space-y-3 mt-3">
                            <textarea
                              value={editedPrompt}
                              onChange={(e) => setEditedPrompt(e.target.value)}
                              className="w-full text-sm rounded-lg border border-slate-300 p-2.5 focus:border-indigo-500 focus:outline-none"
                              rows={2}
                            />
                            <textarea
                              value={editedOutline}
                              onChange={(e) => setEditedOutline(e.target.value)}
                              placeholder="Answer outline..."
                              className="w-full text-sm rounded-lg border border-slate-300 p-2.5 focus:border-indigo-500 focus:outline-none"
                              rows={4}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() =>
                                  updateQuestionMutation.mutate({
                                    questionId: q.id,
                                    patch: {
                                      prompt: editedPrompt,
                                      answer_outline: editedOutline,
                                    },
                                  })
                                }
                                className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                              >
                                <Save className="h-3 w-3" />
                                <span>Save Changes</span>
                              </button>
                              <button
                                onClick={() => setEditingQuestionId(null)}
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <h3 className="text-base font-semibold text-slate-900 leading-snug">
                            {q.prompt}
                          </h3>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            const newPinned = !isPinned;
                            updateQuestionMutation.mutate({
                              questionId: q.id,
                              patch: {
                                ...q,
                                metadata: {
                                  origin: "user",
                                  state: "active",
                                  pinned: newPinned,
                                  revision: 1,
                                },
                              } as any,
                            });
                          }}
                          className={`p-1.5 rounded-lg transition ${
                            isPinned
                              ? "bg-amber-100 text-amber-700"
                              : "text-slate-400 hover:text-slate-600"
                          }`}
                          title={isPinned ? "Pinned (Protected from regeneration)" : "Pin question"}
                        >
                          <Pin className="h-4 w-4" />
                        </button>

                        <button
                          onClick={() => {
                            setEditingQuestionId(q.id);
                            setEditedPrompt(q.prompt);
                            setEditedOutline(q.answer_outline);
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-600 transition"
                          title="Edit question"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>

                        <button
                          onClick={() => {
                            if (confirm("Delete this question?")) {
                              deleteQuestionMutation.mutate(q.id);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 transition"
                          title="Delete question"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>

                        <button
                          onClick={() => toggleExpand(q.id)}
                          className="p-1.5 text-slate-400 hover:text-slate-600 transition"
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {isExpanded && !isEditing && (
                      <div className="mt-4 pt-3 border-t border-slate-100 bg-slate-50 p-4 rounded-xl text-sm">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                          Answer Outline & Evaluation Guide
                        </h4>
                        <p className="text-slate-700 whitespace-pre-line leading-relaxed">
                          {q.answer_outline}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 4: FLASHCARDS */}
        {activeTab === "flashcards" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-900">
                Active-Recall Flashcards ({kit.flashcards.length})
              </h2>
              <button
                onClick={startPractice}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition shadow-sm"
              >
                <Play className="h-3.5 w-3.5" />
                <span>Start Practice Session</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {kit.flashcards.map((f) => (
                <div
                  key={f.id}
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        {f.id}
                      </span>
                      <div className="flex gap-1">
                        {f.requirement_ids.map((rId) => (
                          <span
                            key={rId}
                            className="text-xs font-mono bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded"
                          >
                            [{rId}]
                          </span>
                        ))}
                      </div>
                    </div>
                    <h4 className="text-sm font-semibold text-slate-900 mb-3">{f.front}</h4>
                  </div>
                  <div className="pt-3 border-t border-slate-100 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg">
                    {f.back}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: SCHEDULE */}
        {activeTab === "schedule" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {kit.schedule.days_available}-Day Deterministic Prep Schedule
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  High-priority requirements and harder questions are allocated to earlier days.
                </p>
              </div>
              <button
                onClick={() => regenerateScheduleMutation.mutate()}
                disabled={regenerateScheduleMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${
                    regenerateScheduleMutation.isPending ? "animate-spin" : ""
                  }`}
                />
                <span>Recalculate Schedule</span>
              </button>
            </div>

            <div className="space-y-4">
              {kit.schedule.days.map((day) => (
                <div
                  key={day.day}
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-indigo-600 text-sm">
                        Day {day.day}
                      </span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs font-medium text-slate-500">
                        {day.minutes} Minutes Target
                      </span>
                    </div>
                    <h3 className="text-base font-semibold text-slate-900">{day.focus}</h3>
                  </div>

                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-xs text-slate-500 mr-1">Questions:</span>
                    {day.question_ids.length === 0 ? (
                      <span className="text-xs text-slate-400 italic">
                        Concept Review & Flashcards
                      </span>
                    ) : (
                      day.question_ids.map((qId) => (
                        <span
                          key={qId}
                          className="font-mono text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded"
                        >
                          {qId}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 6: WEAK SPOTS REPORT (CREATIVE FEATURE) */}
        {activeTab === "weakspots" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Flame className="h-5 w-5 text-rose-500" />
                <span>Weak Spots & Readiness Diagnostic</span>
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Aggregated from your interactive flashcard practice attempts.
              </p>
            </div>

            {practiceData?.summary ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Average Confidence
                  </h3>
                  <div className="text-3xl font-extrabold text-slate-900 mt-2">
                    {practiceData.summary.averageConfidence} / 5.0
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Practiced {practiceData.summary.attemptedCount} of{" "}
                    {practiceData.summary.totalFlashcards} cards
                  </p>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm md:col-span-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                    Confidence Distribution
                  </h3>
                  <div className="grid grid-cols-5 gap-2 text-center">
                    {[1, 2, 3, 4, 5].map((lvl) => (
                      <div key={lvl} className="bg-slate-50 p-2 rounded-xl">
                        <div className="text-xs text-slate-500 font-semibold">Lvl {lvl}</div>
                        <div className="text-lg font-bold text-indigo-600 mt-1">
                          {practiceData.summary.confidenceDistribution[lvl.toString()] || 0}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {practiceData.summary.weakFlashcardIds.length > 0 && (
                  <div className="bg-rose-50 border border-rose-200 p-6 rounded-2xl md:col-span-3">
                    <h3 className="text-sm font-bold text-rose-800 flex items-center gap-2 mb-2">
                      <AlertCircle className="h-4 w-4 text-rose-600" />
                      <span>Recommended Focus Areas (Confidence ≤ 2)</span>
                    </h3>
                    <p className="text-xs text-rose-700 mb-4">
                      You identified difficulty with {practiceData.summary.weakFlashcardIds.length}{" "}
                      concept(s). Practice these before interview day.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {practiceData.summary.weakFlashcardIds.map((cardId) => (
                        <span
                          key={cardId}
                          className="font-mono text-xs font-bold bg-white text-rose-800 border border-rose-300 px-2.5 py-1 rounded-md"
                        >
                          Flashcard {cardId}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
                <Flame className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-800">
                  No practice attempts recorded yet
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Launch practice mode to test yourself on flashcards and generate your diagnostic
                  report.
                </p>
                <button
                  onClick={startPractice}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>Start First Practice Session</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 7: RESEARCH PROVENANCE */}
        {activeTab === "research" && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-slate-900">Research Provenance & Grounding</h2>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">
                Crawled Company Pages ({kit.source.pages_used.length})
              </h3>
              <ul className="divide-y divide-slate-100 text-xs">
                {kit.source.pages_used.map((url, i) => (
                  <li key={i} className="py-2.5 flex items-center justify-between">
                    <span className="font-mono text-slate-700 truncate max-w-xl">{url}</span>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 hover:underline flex items-center gap-1"
                    >
                      <span>Visit</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </main>

      {/* ---------------------------------------------------------------------- */}
      {/* INTERACTIVE PRACTICE MODAL */}
      {/* ---------------------------------------------------------------------- */}
      {isPracticing && practiceCards.length > 0 && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col justify-between min-h-[420px]">
            <div>
              <div className="flex justify-between items-center text-xs font-semibold text-slate-500 mb-4">
                <span>
                  Card {currentCardIndex + 1} of {practiceCards.length}
                </span>
                <button
                  onClick={() => setIsPracticing(false)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  ✕ Close
                </button>
              </div>

              <div
                onClick={() => setIsFlipped(!isFlipped)}
                className="cursor-pointer bg-slate-50 border-2 border-indigo-100 hover:border-indigo-300 transition rounded-2xl p-6 min-h-[220px] flex flex-col justify-center items-center text-center"
              >
                {!isFlipped ? (
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
                      Question / Concept
                    </span>
                    <h3 className="text-lg font-bold text-slate-900 mt-4 leading-relaxed">
                      {practiceCards[currentCardIndex].front}
                    </h3>
                    <p className="text-xs text-slate-400 mt-6">Click card to reveal answer</p>
                  </div>
                ) : (
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                      Answer / Key Concept
                    </span>
                    <p className="text-sm font-medium text-slate-800 mt-4 leading-relaxed whitespace-pre-line">
                      {practiceCards[currentCardIndex].back}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {isFlipped ? (
              <div className="mt-6 pt-4 border-t border-slate-100">
                <p className="text-xs text-center font-semibold text-slate-600 mb-2.5">
                  How confident are you with this concept?
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { val: 1, label: "Very Weak", color: "hover:bg-rose-500" },
                    { val: 2, label: "Weak", color: "hover:bg-amber-500" },
                    { val: 3, label: "Fair", color: "hover:bg-yellow-500" },
                    { val: 4, label: "Good", color: "hover:bg-blue-500" },
                    { val: 5, label: "Mastered", color: "hover:bg-emerald-500" },
                  ].map((r) => (
                    <button
                      key={r.val}
                      onClick={() => handleConfidenceRating(r.val)}
                      className={`py-2 px-1 rounded-xl bg-slate-100 hover:text-white ${r.color} text-slate-700 text-xs font-bold transition flex flex-col items-center justify-center`}
                    >
                      <span className="text-sm font-extrabold">{r.val}</span>
                      <span className="text-[10px] hidden sm:inline">{r.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-6 text-center">
                <button
                  onClick={() => setIsFlipped(true)}
                  className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition"
                >
                  Reveal Answer
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
