"use client";

import { AlertCircle, RefreshCw, X } from "lucide-react";

interface MutationErrorBannerProps {
  error: { status?: number; message?: string } | null;
  onClear: () => void;
  onReload: () => void;
}

export function MutationErrorBanner({
  error,
  onClear,
  onReload,
}: MutationErrorBannerProps) {
  if (!error) return null;

  const isConflict =
    error.status === 409 ||
    error.message?.toLowerCase().includes("conflict") ||
    error.message?.toLowerCase().includes("version");

  return (
    <div className="mb-6 rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-900 shadow-sm animate-in fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-rose-900">
              {isConflict ? "Version Conflict Detected" : "Operation Failed"}
            </h4>
            <p className="text-xs text-rose-700 mt-0.5">
              {isConflict
                ? "Could not save because your kit was modified elsewhere. Please reload to sync the latest changes."
                : error.message || "An unexpected error occurred while updating the kit."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onReload}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 transition"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Reload latest</span>
          </button>
          <button
            onClick={onClear}
            className="rounded-lg p-1 text-rose-500 hover:bg-rose-100 transition"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
