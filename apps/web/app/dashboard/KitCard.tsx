"use client";

import { useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { apiClient, fetchKitGenerationStatus } from "@/lib/api-client";
import {
  Calendar,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowRight,
  Sparkles,
} from "lucide-react";

export interface KitListItem {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  company: string;
  role: string;
  days_available: number;
  createdAt: string;
  updatedAt: string;
  generation: {
    stage: string;
    progress: number;
    message?: string;
    error?: { code: string; message: string } | null;
  };
}

interface GenerationStatusResponse {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  stage: string;
  progress: number;
  message?: string;
  error?: { code: string; message: string } | null;
  updatedAt: string;
}

interface KitCardProps {
  kit: KitListItem;
  isHighlighted: boolean;
  onDelete: (e: React.MouseEvent, kitId: string) => void;
}

export function KitCard({ kit, isHighlighted, onDelete }: KitCardProps) {
  const queryClient = useQueryClient();
  const cardRef = useRef<HTMLDivElement>(null);
  const pollStartTimeRef = useRef<number>(Date.now());

  const isInitiallyActive = kit.status === "running" || kit.status === "queued";

  // Individual lightweight status polling ONLY for active generations
  const { data: statusData } = useQuery<GenerationStatusResponse>({
    queryKey: ["kit-status", kit.id],
    queryFn: () => fetchKitGenerationStatus(kit.id),
    enabled: isInitiallyActive,
    refetchInterval: (query) => {
      const status = query.state.data?.status || kit.status;
      if (status !== "running" && status !== "queued") {
        return false;
      }
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return false;
      }
      const elapsed = Date.now() - pollStartTimeRef.current;
      if (elapsed < 15000) return 2000;
      if (elapsed < 45000) return 3000;
      if (elapsed < 90000) return 5000;
      return 8000;
    },
  });

  // Reconcile status update into dashboard kits cache when status changes
  useEffect(() => {
    if (!statusData) return;

    if (
      statusData.status === "completed" ||
      statusData.status === "failed" ||
      statusData.status === "cancelled"
    ) {
      queryClient.setQueryData<{ kits: KitListItem[] }>(["kits"], (old) => {
        if (!old) return old;
        return {
          ...old,
          kits: old.kits.map((k) =>
            k.id === kit.id
              ? {
                  ...k,
                  status: statusData.status,
                  generation: {
                    ...k.generation,
                    stage: statusData.stage,
                    progress: statusData.progress,
                    message: statusData.message,
                    error: statusData.error,
                  },
                }
              : k
          ),
        };
      });
    }
  }, [statusData, kit.id, queryClient]);

  // Smooth scroll into view if highlighted
  useEffect(() => {
    if (isHighlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isHighlighted]);

  const currentStatus = statusData?.status || kit.status;
  const currentProgress = statusData?.progress ?? kit.generation?.progress ?? 0;
  const currentMessage = statusData?.message || kit.generation?.message || "Analyzing requirements...";
  const currentError = statusData?.error || kit.generation?.error;

  const isActive = currentStatus === "running" || currentStatus === "queued";
  const isCompleted = currentStatus === "completed";
  const isFailed = currentStatus === "failed";
  const isCancelled = currentStatus === "cancelled";

  return (
    <div
      ref={cardRef}
      className={`group relative flex flex-col justify-between rounded-xl border bg-white p-6 transition-all duration-300 ${
        isHighlighted
          ? isActive
            ? "border-indigo-500 ring-2 ring-indigo-500/40 shadow-lg bg-indigo-50/10 animate-pulse"
            : "border-indigo-300 ring-1 ring-indigo-200 shadow-md"
          : "border-slate-200 hover:border-indigo-300 hover:shadow-md shadow-sm"
      }`}
    >
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                isCompleted
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : isActive
                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                  : isCancelled
                  ? "bg-slate-100 text-slate-700 border border-slate-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {isCompleted ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Ready</span>
                </>
              ) : isActive ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
                  <span>Generating ({currentProgress}%)</span>
                </>
              ) : isCancelled ? (
                <span>Cancelled</span>
              ) : (
                <>
                  <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                  <span>Failed</span>
                </>
              )}
            </span>

            {isHighlighted && isActive && (
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-800">
                <Sparkles className="h-2.5 w-2.5" />
                <span>Active Generation</span>
              </span>
            )}
          </div>

          <button
            onClick={(e) => onDelete(e, kit.id)}
            className="text-slate-400 hover:text-red-600 transition p-1"
            title="Delete Kit"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition">
          {kit.role || "Interview Prep Kit"}
        </h3>
        <p className="text-sm font-medium text-slate-600 mt-0.5">{kit.company || "Company"}</p>

        {/* Progress Bar for Active Generations */}
        {isActive && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-medium text-indigo-700">Generation in progress</span>
              <span>{currentProgress}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 transition-all duration-300"
                style={{ width: `${Math.max(5, currentProgress)}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1.5 truncate">
              {currentMessage}
            </p>
          </div>
        )}

        {isFailed && (
          <p className="text-xs text-red-600 mt-2 line-clamp-2">
            {currentError?.message || "Generation encountered an error."}
          </p>
        )}
      </div>

      <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-slate-400" />
          <span>{kit.days_available} Days Prep</span>
        </div>
        <Link
          href={`/kits/${kit.id}`}
          className="flex items-center gap-1 text-indigo-600 font-semibold group-hover:translate-x-0.5 transition"
        >
          <span>{isActive ? "View Progress" : "Open Kit"}</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
