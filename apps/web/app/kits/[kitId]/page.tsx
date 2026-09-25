"use client";

import { use, useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { apiClient, ApiError, fetchKitGenerationStatus } from "@/lib/api-client";
import { Loader2, AlertCircle } from "lucide-react";
import type {
  Kit,
  Question,
  Flashcard,
  QuestionCategory,
  PracticeSummary,
} from "@ai-interview-prep/shared";

// Modular Kit Components
import { MutationErrorBanner } from "@/components/kit/MutationErrorBanner";
import { KitHeader } from "@/components/kit/KitHeader";
import { GenerationProgressView } from "@/components/kit/GenerationProgressView";
import { OverviewTab } from "@/components/kit/OverviewTab";
import { QuestionBank } from "@/components/kit/QuestionBank";
import { FlashcardBank } from "@/components/kit/FlashcardBank";
import { ScheduleSection } from "@/components/kit/ScheduleSection";
import { WeakSpotsReport } from "@/components/kit/WeakSpotsReport";
import { ResearchEvidenceView } from "@/components/kit/ResearchEvidenceView";
import { PracticeModal } from "@/components/kit/PracticeModal";

interface GenerationStatusResponse {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  stage: string;
  progress: number;
  message?: string;
  error?: { code: string; message: string } | null;
  generation?: {
    stage: string;
    progress: number;
    message?: string;
    error?: { code: string; message: string } | null;
  };
  updatedAt: string;
}

interface KitResponse {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
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
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<
    "overview" | "questions" | "flashcards" | "schedule" | "weakspots" | "research"
  >("overview");

  // Mutation error state (visible conflict / network error handling)
  const [mutationError, setMutationError] = useState<{
    status?: number;
    message?: string;
  } | null>(null);

  // Practice Mode State
  const [isPracticing, setIsPracticing] = useState(false);
  const [practiceCards, setPracticeCards] = useState<Flashcard[]>([]);

  // Regeneration notification message
  const [regenNotice, setRegenNotice] = useState<string | null>(null);

  const pollStartTimeRef = useRef<number>(Date.now());

  // 1. Lightweight Status Query: Polls status during active generation (resilient across endpoint variations)
  const statusQuery = useQuery<GenerationStatusResponse>({
    queryKey: ["kit-status", kitId],
    queryFn: () => fetchKitGenerationStatus(kitId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // Stop immediately on terminal states
      if (!status || (status !== "running" && status !== "queued")) {
        return false;
      }

      // Pause polling when browser tab is hidden to save battery and network
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return false;
      }

      // Adaptive polling based on elapsed generation time
      const elapsed = Date.now() - pollStartTimeRef.current;
      if (elapsed < 15000) return 2000;
      if (elapsed < 45000) return 3000;
      if (elapsed < 90000) return 5000;
      return 8000;
    },
  });

  // Re-fetch immediately when user returns to a visible tab if generation was in progress
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        const currentStatus = statusQuery.data?.status;
        if (!currentStatus || currentStatus === "running" || currentStatus === "queued") {
          statusQuery.refetch();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [statusQuery]);

  const isStatusCompleted = statusQuery.data?.status === "completed";
  const isStatusError = Boolean(statusQuery.error);

  // 2. Full Kit Query: Only fetches full representation ONCE generation has completed OR as fallback
  const {
    data,
    isLoading: isKitLoading,
    error: kitError,
    refetch: refetchKit,
  } = useQuery<KitResponse>({
    queryKey: ["kit", kitId],
    queryFn: () => apiClient(`/kits/${kitId}`),
    enabled: isStatusCompleted || isStatusError,
    staleTime: 30000,
    retry: (failureCount, err) => {
      if ((err as ApiError)?.statusCode === 404) return false;
      return failureCount < 2;
    },
  });

  // Query Practice Summary
  const { data: practiceData, refetch: refetchPractice } = useQuery<{
    summary: PracticeSummary;
  }>({
    queryKey: ["practice-summary", kitId],
    queryFn: () => apiClient(`/kits/${kitId}/practice/summary`),
    enabled: isStatusCompleted && !!data?.kit,
  });

  const handleMutationError = (err: unknown) => {
    if (err instanceof ApiError) {
      setMutationError({ status: err.statusCode, message: err.message });
    } else {
      setMutationError({
        message: (err as Error)?.message || "Action failed to save",
      });
    }
  };

  // --- Optimistic Mutations ---

  const addQuestionMutation = useMutation({
    mutationFn: (newQuestion: Question) =>
      apiClient(`/kits/${kitId}/questions`, {
        method: "POST",
        body: JSON.stringify(newQuestion),
      }),
    onMutate: async (newQuestion: Question) => {
      setMutationError(null);
      await queryClient.cancelQueries({ queryKey: ["kit", kitId] });
      const previousData = queryClient.getQueryData<KitResponse>(["kit", kitId]);

      if (previousData?.kit) {
        queryClient.setQueryData<KitResponse>(["kit", kitId], {
          ...previousData,
          kit: {
            ...previousData.kit,
            questions: [...previousData.kit.questions, newQuestion],
          },
        });
      }
      return { previousData };
    },
    onError: (err, _vars, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["kit", kitId], context.previousData);
      }
      handleMutationError(err);
    },
    onSuccess: () => {
      setMutationError(null);
    },
  });

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
    onMutate: async ({ questionId, patch }) => {
      setMutationError(null);
      await queryClient.cancelQueries({ queryKey: ["kit", kitId] });
      const previousData = queryClient.getQueryData<KitResponse>(["kit", kitId]);

      if (previousData?.kit) {
        queryClient.setQueryData<KitResponse>(["kit", kitId], {
          ...previousData,
          kit: {
            ...previousData.kit,
            questions: previousData.kit.questions.map((q) =>
              q.id === questionId ? { ...q, ...patch } : q
            ),
          },
        });
      }
      return { previousData };
    },
    onError: (err, _vars, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["kit", kitId], context.previousData);
      }
      handleMutationError(err);
    },
    onSuccess: () => {
      setMutationError(null);
    },
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: (questionId: string) =>
      apiClient(`/kits/${kitId}/questions/${questionId}`, {
        method: "DELETE",
      }),
    onMutate: async (questionId: string) => {
      setMutationError(null);
      await queryClient.cancelQueries({ queryKey: ["kit", kitId] });
      const previousData = queryClient.getQueryData<KitResponse>(["kit", kitId]);

      if (previousData?.kit) {
        queryClient.setQueryData<KitResponse>(["kit", kitId], {
          ...previousData,
          kit: {
            ...previousData.kit,
            questions: previousData.kit.questions.filter((q) => q.id !== questionId),
          },
        });
      }
      return { previousData };
    },
    onError: (err, _vars, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["kit", kitId], context.previousData);
      }
      handleMutationError(err);
    },
    onSuccess: () => {
      setMutationError(null);
    },
  });

  const reorderQuestionsMutation = useMutation({
    mutationFn: (questionIds: string[]) =>
      apiClient(`/kits/${kitId}/questions/order`, {
        method: "PATCH",
        body: JSON.stringify({ questionIds }),
      }),
    onMutate: async (questionIds: string[]) => {
      setMutationError(null);
      await queryClient.cancelQueries({ queryKey: ["kit", kitId] });
      const previousData = queryClient.getQueryData<KitResponse>(["kit", kitId]);

      if (previousData?.kit) {
        const orderMap = new Map(questionIds.map((id, index) => [id, index]));
        const sorted = [...previousData.kit.questions].sort((a, b) => {
          const idxA = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
          const idxB = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
          return idxA - idxB;
        });

        queryClient.setQueryData<KitResponse>(["kit", kitId], {
          ...previousData,
          kit: {
            ...previousData.kit,
            questions: sorted,
          },
        });
      }
      return { previousData };
    },
    onError: (err, _vars, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["kit", kitId], context.previousData);
      }
      handleMutationError(err);
    },
    onSuccess: () => {
      setMutationError(null);
    },
  });

  const addFlashcardMutation = useMutation({
    mutationFn: (newCard: Flashcard) =>
      apiClient(`/kits/${kitId}/flashcards`, {
        method: "POST",
        body: JSON.stringify(newCard),
      }),
    onMutate: async (newCard: Flashcard) => {
      setMutationError(null);
      await queryClient.cancelQueries({ queryKey: ["kit", kitId] });
      const previousData = queryClient.getQueryData<KitResponse>(["kit", kitId]);

      if (previousData?.kit) {
        queryClient.setQueryData<KitResponse>(["kit", kitId], {
          ...previousData,
          kit: {
            ...previousData.kit,
            flashcards: [...previousData.kit.flashcards, newCard],
          },
        });
      }
      return { previousData };
    },
    onError: (err, _vars, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["kit", kitId], context.previousData);
      }
      handleMutationError(err);
    },
    onSuccess: () => {
      setMutationError(null);
    },
  });

  const updateFlashcardMutation = useMutation({
    mutationFn: ({
      flashcardId,
      patch,
    }: {
      flashcardId: string;
      patch: Partial<Flashcard>;
    }) =>
      apiClient(`/kits/${kitId}/flashcards/${flashcardId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onMutate: async ({ flashcardId, patch }) => {
      setMutationError(null);
      await queryClient.cancelQueries({ queryKey: ["kit", kitId] });
      const previousData = queryClient.getQueryData<KitResponse>(["kit", kitId]);

      if (previousData?.kit) {
        queryClient.setQueryData<KitResponse>(["kit", kitId], {
          ...previousData,
          kit: {
            ...previousData.kit,
            flashcards: previousData.kit.flashcards.map((f) =>
              f.id === flashcardId ? { ...f, ...patch } : f
            ),
          },
        });
      }
      return { previousData };
    },
    onError: (err, _vars, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["kit", kitId], context.previousData);
      }
      handleMutationError(err);
    },
    onSuccess: () => {
      setMutationError(null);
    },
  });

  const deleteFlashcardMutation = useMutation({
    mutationFn: (flashcardId: string) =>
      apiClient(`/kits/${kitId}/flashcards/${flashcardId}`, {
        method: "DELETE",
      }),
    onMutate: async (flashcardId: string) => {
      setMutationError(null);
      await queryClient.cancelQueries({ queryKey: ["kit", kitId] });
      const previousData = queryClient.getQueryData<KitResponse>(["kit", kitId]);

      if (previousData?.kit) {
        queryClient.setQueryData<KitResponse>(["kit", kitId], {
          ...previousData,
          kit: {
            ...previousData.kit,
            flashcards: previousData.kit.flashcards.filter((f) => f.id !== flashcardId),
          },
        });
      }
      return { previousData };
    },
    onError: (err, _vars, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["kit", kitId], context.previousData);
      }
      handleMutationError(err);
    },
    onSuccess: () => {
      setMutationError(null);
    },
  });

  const regenerateCategoryMutation = useMutation({
    mutationFn: (category: QuestionCategory) =>
      apiClient<{ message: string; preservedCount: number; newCount: number }>(
        `/kits/${kitId}/regenerate/questions/${category}`,
        { method: "POST" }
      ),
    onSuccess: (res) => {
      setMutationError(null);
      queryClient.invalidateQueries({ queryKey: ["kit", kitId] });
      setRegenNotice(
        `${res.message || "Category regenerated."} (Preserved: ${res.preservedCount}, Fresh: ${res.newCount})`
      );
      setTimeout(() => setRegenNotice(null), 8000);
    },
    onError: handleMutationError,
  });

  const regenerateBriefMutation = useMutation({
    mutationFn: () =>
      apiClient(`/kits/${kitId}/regenerate/company-brief`, {
        method: "POST",
      }),
    onSuccess: () => {
      setMutationError(null);
      queryClient.invalidateQueries({ queryKey: ["kit", kitId] });
      setRegenNotice("Company brief regenerated based on saved research.");
      setTimeout(() => setRegenNotice(null), 5000);
    },
    onError: handleMutationError,
  });

  const regenerateScheduleMutation = useMutation({
    mutationFn: () =>
      apiClient(`/kits/${kitId}/regenerate/schedule`, {
        method: "POST",
      }),
    onSuccess: () => {
      setMutationError(null);
      queryClient.invalidateQueries({ queryKey: ["kit", kitId] });
      setRegenNotice("Schedule recalculated based on latest question bank.");
      setTimeout(() => setRegenNotice(null), 5000);
    },
    onError: handleMutationError,
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
    onError: handleMutationError,
  });

  const deleteKitMutation = useMutation({
    mutationFn: () =>
      apiClient(`/kits/${kitId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      router.push("/dashboard");
    },
    onError: handleMutationError,
  });

  // Start Practice Mode
  const startPractice = async () => {
    try {
      const res = await apiClient<{ cards: Flashcard[] }>(
        `/kits/${kitId}/practice/cards`
      );
      if (res.cards.length > 0) {
        setPracticeCards(res.cards);
        setIsPracticing(true);
        return;
      }
    } catch {
      // fallback to kit flashcards
    }

    if (data?.kit?.flashcards && data.kit.flashcards.length > 0) {
      setPracticeCards(data.kit.flashcards);
      setIsPracticing(true);
    }
  };

  // 1. Initial loading state while querying status
  if (statusQuery.isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
        </div>
      </div>
    );
  }

  // 2. Active generation (running or queued) served from lightweight status query
  const statusData = statusQuery.data;
  if (statusData && (statusData.status === "running" || statusData.status === "queued")) {
    const genMeta = statusData.generation || {
      stage: statusData.stage || "starting",
      progress: statusData.progress ?? 5,
      message: statusData.message,
      error: statusData.error,
    };
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <GenerationProgressView
          status={statusData.status}
          generation={genMeta}
          onRetry={() => router.push("/kits/new")}
        />
      </div>
    );
  }

  // 3. Failed or cancelled state served from lightweight status query
  if (statusData && (statusData.status === "failed" || statusData.status === "cancelled")) {
    const genMeta = statusData.generation || {
      stage: statusData.stage || "failed",
      progress: statusData.progress ?? 0,
      message: statusData.message,
      error: statusData.error,
    };
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <GenerationProgressView
          status={statusData.status}
          generation={genMeta}
          onRetry={() => router.push("/kits/new")}
        />
      </div>
    );
  }

  // 4. Fallback when statusQuery fails: use full kit query to determine existence
  if (isStatusError) {
    if (isKitLoading) {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
          <Navbar />
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
          </div>
        </div>
      );
    }

    if (kitError) {
      const is404 = (kitError as ApiError)?.statusCode === 404;
      if (is404) {
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

      return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
          <Navbar />
          <div className="mx-auto max-w-md my-auto p-6 bg-white rounded-2xl border border-slate-200 shadow-sm text-center">
            <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-slate-900">Connection Error</h2>
            <p className="text-sm text-slate-600 mt-1">
              Unable to reach the server. Please check your connection and try again.
            </p>
            <button
              onClick={() => {
                statusQuery.refetch();
                refetchKit();
              }}
              className="mt-5 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    if (data) {
      if (
        data.status === "running" ||
        data.status === "queued" ||
        data.status === "failed" ||
        data.status === "cancelled"
      ) {
        return (
          <div className="min-h-screen bg-slate-50 flex flex-col">
            <Navbar />
            <GenerationProgressView
              status={data.status}
              generation={data.generation}
              onRetry={() => router.push("/kits/new")}
            />
          </div>
        );
      }

      if (!data.kit) {
        return (
          <div className="min-h-screen bg-slate-50 flex flex-col">
            <Navbar />
            <div className="mx-auto max-w-md my-auto p-6 bg-white rounded-2xl border border-amber-200 shadow-sm text-center">
              <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
              <h2 className="text-lg font-bold text-slate-900">
                Generation status temporarily unavailable
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                The kit exists, but live status could not be fetched.
              </p>
              <button
                onClick={() => {
                  statusQuery.refetch();
                  refetchKit();
                }}
                className="mt-5 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                Retry
              </button>
            </div>
          </div>
        );
      }
    }
  }

  // 5. Completed kit loading state
  if (isStatusCompleted && isKitLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
        </div>
      </div>
    );
  }

  if (isStatusCompleted && (kitError || !data?.kit)) {
    const is404 = (kitError as ApiError)?.statusCode === 404;
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <div className="mx-auto max-w-md my-auto p-6 bg-white rounded-2xl border border-red-200 shadow-sm text-center">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-900">
            {is404 ? "Kit Not Found" : "Error Loading Kit"}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            {is404
              ? "This prep kit could not be loaded or you may not have permission to view it."
              : "Unable to load completed prep kit. Please try again."}
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <Link
              href="/dashboard"
              className="inline-block rounded-lg bg-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-300"
            >
              Return to Dashboard
            </Link>
            {!is404 && (
              <button
                onClick={() => refetchKit()}
                className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!data?.kit) {
    return null;
  }

  const kit = data.kit;

  const TAB_ITEMS = [
    { id: "overview", label: "Overview & Role" },
    { id: "questions", label: `Question Builder (${kit.questions.length})` },
    { id: "flashcards", label: `Flashcards (${kit.flashcards.length})` },
    { id: "schedule", label: `Schedule (${kit.schedule.days_available}d)` },
    { id: "weakspots", label: "Weak Spots Diagnostic" },
    { id: "research", label: "Research Evidence" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      {/* Header */}
      <KitHeader
        kit={kit}
        kitId={kitId}
        onStartPractice={startPractice}
        onDeleteKit={() => {
          if (window.confirm("Are you sure you want to permanently delete this kit?")) {
            deleteKitMutation.mutate();
          }
        }}
        isDeleting={deleteKitMutation.isPending}
        regenNotice={regenNotice}
      />

      {/* Tab Navigation */}
      <div className="border-b border-slate-200 bg-white sticky top-0 z-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-6 overflow-x-auto py-3">
            {TAB_ITEMS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`text-xs font-semibold whitespace-nowrap pb-2 border-b-2 transition ${
                  activeTab === tab.id
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Workspace Body */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {/* Mutation Error / Conflict Banner */}
        <MutationErrorBanner
          error={mutationError}
          onClear={() => setMutationError(null)}
          onReload={() => {
            setMutationError(null);
            refetchKit();
          }}
        />

        {/* Tab Panels */}
        {activeTab === "overview" && (
          <OverviewTab
            kit={kit}
            onRegenerateBrief={() => regenerateBriefMutation.mutate()}
            isRegeneratingBrief={regenerateBriefMutation.isPending}
          />
        )}

        {activeTab === "questions" && (
          <QuestionBank
            questions={kit.questions}
            requirements={kit.role.requirements}
            onAddQuestion={(q) => addQuestionMutation.mutate(q)}
            onUpdateQuestion={(qId, patch) =>
              updateQuestionMutation.mutate({ questionId: qId, patch })
            }
            onDeleteQuestion={(qId) => deleteQuestionMutation.mutate(qId)}
            onReorderQuestions={(ids) => reorderQuestionsMutation.mutate(ids)}
            onRegenerateCategory={(cat) => regenerateCategoryMutation.mutate(cat)}
            isRegeneratingCategory={regenerateCategoryMutation.isPending}
          />
        )}

        {activeTab === "flashcards" && (
          <FlashcardBank
            flashcards={kit.flashcards}
            requirements={kit.role.requirements}
            practiceSummary={practiceData?.summary}
            onAddFlashcard={(c) => addFlashcardMutation.mutate(c)}
            onUpdateFlashcard={(fId, patch) =>
              updateFlashcardMutation.mutate({ flashcardId: fId, patch })
            }
            onDeleteFlashcard={(fId) => deleteFlashcardMutation.mutate(fId)}
            onStartPractice={startPractice}
          />
        )}

        {activeTab === "schedule" && (
          <ScheduleSection
            schedule={kit.schedule}
            questions={kit.questions}
            onRegenerateSchedule={() => regenerateScheduleMutation.mutate()}
            isRegeneratingSchedule={regenerateScheduleMutation.isPending}
          />
        )}

        {activeTab === "weakspots" && (
          <WeakSpotsReport
            kit={kit}
            practiceSummary={practiceData?.summary}
          />
        )}

        {activeTab === "research" && <ResearchEvidenceView kit={kit} />}
      </main>

      {/* Practice Mode Interactive Modal */}
      <PracticeModal
        isOpen={isPracticing}
        cards={practiceCards}
        onClose={() => setIsPracticing(false)}
        onRecordConfidence={(cardId, confidence) =>
          recordAttemptMutation.mutate({ flashcardId: cardId, confidence })
        }
      />
    </div>
  );
}
