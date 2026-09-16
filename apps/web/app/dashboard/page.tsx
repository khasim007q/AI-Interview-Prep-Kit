"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { apiClient } from "@/lib/api-client";
import {
  PlusCircle,
  Briefcase,
  Calendar,
  Clock,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowRight,
  ExternalLink,
} from "lucide-react";

interface KitListItem {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
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

export default function DashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<{ kits: KitListItem[] }>({
    queryKey: ["kits"],
    queryFn: () => apiClient("/kits"),
    refetchInterval: (query) => {
      // Poll if any kit is still running or queued
      const hasRunning = query.state.data?.kits.some(
        (k) => k.status === "running" || k.status === "queued"
      );
      return hasRunning ? 2000 : false;
    },
  });

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
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

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
              <Link
                key={kit.id}
                href={`/kits/${kit.id}`}
                className="group relative flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:border-indigo-300 hover:shadow-md transition"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                        kit.status === "completed"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : kit.status === "running" || kit.status === "queued"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-red-50 text-red-700 border border-red-200"
                      }`}
                    >
                      {kit.status === "completed" ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Ready</span>
                        </>
                      ) : kit.status === "running" || kit.status === "queued" ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
                          <span>Generating ({kit.generation.progress}%)</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                          <span>Failed</span>
                        </>
                      )}
                    </span>

                    <button
                      onClick={(e) => handleDelete(e, kit.id)}
                      className="text-slate-400 hover:text-red-600 transition p-1"
                      title="Delete Kit"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition">
                    {kit.role}
                  </h3>
                  <p className="text-sm font-medium text-slate-600 mt-0.5">{kit.company}</p>

                  {kit.status === "running" && (
                    <div className="mt-4">
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 transition-all duration-300"
                          style={{ width: `${kit.generation.progress}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-1.5 truncate">
                        {kit.generation.message || "Analyzing requirements..."}
                      </p>
                    </div>
                  )}

                  {kit.status === "failed" && (
                    <p className="text-xs text-red-600 mt-2 line-clamp-2">
                      {kit.generation.error?.message || "Generation encountered an error."}
                    </p>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    <span>{kit.days_available} Days Prep</span>
                  </div>
                  <div className="flex items-center gap-1 text-indigo-600 font-semibold group-hover:translate-x-0.5 transition">
                    <span>Open Kit</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
