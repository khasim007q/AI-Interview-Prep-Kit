function getBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
  const trimmed = raw.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

const API_BASE_URL = getBaseUrl();

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${API_BASE_URL}${cleanEndpoint}`;

  const method = (options.method || "GET").toUpperCase();
  const hasBody = options.body !== undefined && options.body !== null;

  const defaultHeaders: Record<string, string> = {
    Accept: "application/json",
  };

  // Only send Content-Type when there is a payload to prevent triggering unnecessary CORS preflight OPTIONS requests
  if (hasBody || (method !== "GET" && method !== "HEAD")) {
    defaultHeaders["Content-Type"] = "application/json";
  }

  const config: RequestInit = {
    ...options,
    credentials: "include", // Send HTTP-only session cookies
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  const res = await fetch(url, config);

  if (res.status === 204) {
    return {} as T;
  }

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (!res.ok) {
    if (isJson) {
      const errorData = (await res.json()) as ApiErrorResponse;
      throw new ApiError(
        res.status,
        errorData.error?.code || "API_ERROR",
        errorData.error?.message || `HTTP ${res.status} error`,
        errorData.error?.details
      );
    }
    const text = await res.text();
    throw new ApiError(res.status, "HTTP_ERROR", text || `HTTP ${res.status}`);
  }

  if (isJson) {
    return (await res.json()) as T;
  }

  return (await res.text()) as unknown as T;
}

export interface KitGenerationStatusDto {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  stage: string;
  progress: number;
  message?: string;
  error?: { code: string; message: string; details?: unknown } | null;
  generation?: {
    status?: "queued" | "running" | "completed" | "failed" | "cancelled";
    stage: string;
    progress: number;
    message?: string;
    error?: { code: string; message: string; details?: unknown } | null;
  };
  updatedAt: string;
}

/**
 * Resiliently fetches generation status.
 * Checks /kits/:kitId/generation (universally supported across currently running and newly deployed backend instances),
 * with transparent fallback to /kits/:kitId/generation-status if needed.
 */
export async function fetchKitGenerationStatus(kitId: string): Promise<KitGenerationStatusDto> {
  let res: any;
  try {
    res = await apiClient<any>(`/kits/${kitId}/generation`);
  } catch (err: unknown) {
    if (err instanceof ApiError && err.statusCode === 404) {
      res = await apiClient<any>(`/kits/${kitId}/generation-status`);
    } else {
      throw err;
    }
  }

  return {
    id: res.id || kitId,
    status: res.status,
    stage: res.stage || res.generation?.stage || "starting",
    progress: res.progress ?? res.generation?.progress ?? 0,
    message: res.message || res.generation?.message || "",
    error: res.error || res.generation?.error || null,
    generation: res.generation,
    updatedAt: res.updatedAt || new Date().toISOString(),
  };
}

