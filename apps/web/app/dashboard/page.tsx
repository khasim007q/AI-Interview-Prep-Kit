"use client";

import { useEffect, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { apiClient } from "@/lib/api-client";
import {
  PlusCircle,
  Briefcase,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { KitCard, type KitListItem } from "./KitCard";

function DashboardContent() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const highlightKitId = searchParams.get("highlight");

  // Initial load of kits without continuous full-list polling
  const { data, isLoading, error } = useQuery<{ kits: KitListItem[] }>({
    queryKey: ["kits"],
    queryFn: () => apiClient("/kits"),
    refetchInterval: false, // Do NOT continuously poll the full kit list
    staleTime: 60000,
  });

  // Re-fetch kits list when user returns to dashboard tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        queryClient.invalidateQueries({ queryKey: ["kits"] });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [queryClient]);

  const deleteMutation = useMutation({
    mutationFn: (kitId: string) =>
      apiClient(`/kits/${kitId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kits"] });
    },
  });

  const handleDelete = (e: React.MouseEvent, kitId: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (confirm("Are you sure you want to delete this prep kit?")) {
      deleteMutation.mutate(kitId);
    }
  };

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Interview Preparation Kits
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage your personalized, research-grounded interview prep workspaces.
          </p>
        </div>
        <Link
          href="/kits/new"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition"
        >
          <PlusCircle className="h-4 w-4" />
          <span>Create New Kit</span>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-700">
          <AlertCircle className="mx-auto h-8 w-8 text-red-500 mb-2" />
          <p className="font-semibold">Unable to load prep kits</p>
          <p className="text-sm mt-1">Please sign in or try refreshing the page.</p>
          <Link
            href="/login"
            className="mt-4 inline-block rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500"
          >
            Sign In
          </Link>
        </div>
      ) : data?.kits.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 p-12 text-center bg-white">
          <Briefcase className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-4 text-lg font-semibold text-slate-900">No prep kits created yet</h3>
          <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto">
            Paste a job description and company URL to generate structured interview questions, flashcards, and a day-by-day prep schedule.
          </p>
          <div className="mt-6">
            <Link
              href="/kits/new"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Create Your First Kit</span>
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {data?.kits.map((kit) => (
            <KitCard
              key={kit.id}
              kit={kit}
              isHighlighted={highlightKitId === kit.id}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </main>
  );
}

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />
      <Suspense
        fallback={
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        }
      >
        <DashboardContent />
      </Suspense>
    </div>
  );
}
