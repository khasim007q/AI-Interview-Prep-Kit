"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/use-auth";
import { Sparkles, BookOpen, LogOut, PlusCircle } from "lucide-react";

export function Navbar() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-indigo-600 text-lg">
          <Sparkles className="h-5 w-5 text-indigo-600" />
          <span>AI Interview Prep Kit</span>
        </Link>

        <div className="flex items-center gap-4">
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="text-sm font-medium text-slate-600 hover:text-slate-900 transition flex items-center gap-1.5"
              >
                <BookOpen className="h-4 w-4" />
                <span>Dashboard</span>
              </Link>
              <Link
                href="/kits/new"
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 transition"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                <span>New Kit</span>
              </Link>
              <span className="text-xs text-slate-500 hidden sm:inline">{user.email}</span>
              <button
                onClick={handleLogout}
                className="text-xs font-medium text-slate-500 hover:text-red-600 transition flex items-center gap-1"
                title="Log out"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="text-sm font-medium text-slate-700 hover:text-indigo-600 transition"
              >
                Log In
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 transition"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
