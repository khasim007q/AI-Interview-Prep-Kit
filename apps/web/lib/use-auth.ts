"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./api-client";
import type { UserResponse } from "@ai-interview-prep/shared";

export function useAuth() {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery<{ user: UserResponse } | null>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        return await apiClient<{ user: UserResponse }>("/auth/me");
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logout = async () => {
    try {
      await apiClient("/auth/logout", { method: "POST" });
    } finally {
      queryClient.setQueryData(["auth", "me"], null);
    }
  };

  const setUser = (user: UserResponse | null) => {
    queryClient.setQueryData(["auth", "me"], user ? { user } : null);
  };

  return {
    user: data?.user || null,
    isLoading,
    error,
    logout,
    setUser,
    refetch,
  };
}
