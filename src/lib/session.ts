import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMatches } from "react-router";
import { CLIENT_ROUTES } from "../../shared/routes";
import { ApiError, get, setCsrfToken } from "./api";
import type { PublicConfig, SessionData } from "./types";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      // api() already retries safe reads with backoff; don't multiply retries here.
      retry: false,
    },
  },
});

export const SESSION_KEY = ["session"] as const;

/** Routes flagged `handle.noApi` (the 404) must not trigger any API request, including the layout's own. */
export function useNoApiRoute(): boolean {
  return useMatches().some((m) => (m.handle as { noApi?: boolean } | undefined)?.noApi === true);
}

export function useSession() {
  const noApi = useNoApiRoute();
  return useQuery({
    enabled: !noApi,
    queryKey: SESSION_KEY,
    queryFn: async ({ signal }) => {
      const s = await get<SessionData>("/api/auth/session", signal);
      setCsrfToken(s.csrfToken); // memory only
      return s;
    },
    staleTime: 5 * 60_000,
  });
}

export function useApplySession() {
  const qc = useQueryClient();
  return (s: SessionData) => {
    setCsrfToken(s.csrfToken);
    qc.setQueryData(SESSION_KEY, s);
  };
}

export function useClearSession() {
  const qc = useQueryClient();
  return () => {
    setCsrfToken(null);
    void qc.cancelQueries();
    // Drop every user-scoped cache entry, but keep the session query mounted observers are subscribed to
    // (qc.clear() would detach them and the UI would never learn it is signed out).
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== SESSION_KEY[0] && q.queryKey[0] !== "public-config" });
    qc.setQueryData(SESSION_KEY, { user: null, csrfToken: null } satisfies SessionData);
  };
}

export function usePublicConfig() {
  const noApi = useNoApiRoute();
  return useQuery({
    enabled: !noApi,
    queryKey: ["public-config"],
    queryFn: ({ signal }) => get<PublicConfig>("/api/config/public", signal),
    staleTime: 10 * 60_000,
  });
}

/** Post-login redirect target: only same-site paths that the SPA actually owns (no open redirects). */
export function safeNext(raw: string | null | undefined, fallback = "/account"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  const path = raw.split(/[?#]/)[0]!;
  return CLIENT_ROUTES.includes(path) ? raw : fallback;
}

export const isUnauthenticated = (e: unknown) => e instanceof ApiError && e.status === 401;
