/**
 * The ONLY way the browser talks to the server. Cookies carry the session (HttpOnly, so
 * unreadable here); the CSRF token lives in memory only. Nothing here is a source of truth:
 * every response is advisory UI state and the server re-checks everything.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
    public readonly fields?: Record<string, string>,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
  get isNetwork() {
    return this.code === "NETWORK" || this.code === "TIMEOUT";
  }
}

let csrfToken: string | null = null;
export const setCsrfToken = (t: string | null) => {
  csrfToken = t;
};

const TIMEOUT_MS = 15_000;
const RETRYABLE = new Set([502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Options {
  body?: unknown;
  signal?: AbortSignal;
}

async function once<T>(method: string, path: string, opts: Options): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException("timeout", "TimeoutError")), TIMEOUT_MS);
  opts.signal?.addEventListener("abort", () => ctrl.abort(opts.signal?.reason), { once: true });
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        ...(method !== "GET" ? { "Content-Type": "application/json", ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}) } : {}),
      },
      body: method === "GET" ? undefined : JSON.stringify(opts.body ?? {}),
    });
  } catch (err) {
    if (opts.signal?.aborted) throw err;
    const timedOut = (err as { name?: string })?.name === "TimeoutError" || ctrl.signal.aborted;
    throw new ApiError(0, timedOut ? "TIMEOUT" : "NETWORK", timedOut ? "That took too long. Please try again." : "Can't reach VOXY. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }

  let json: { ok?: boolean; data?: T; error?: { code: string; message: string; requestId?: string; fields?: Record<string, string> } } | null = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON (proxy error page etc.) */
  }
  if (res.ok && json?.ok) return json.data as T;
  const retryAfter = Number(res.headers.get("Retry-After")) || undefined;
  throw new ApiError(
    res.status,
    json?.error?.code ?? "UNKNOWN",
    json?.error?.message ?? "Something went wrong. Please try again.",
    json?.error?.requestId ?? res.headers.get("X-Request-Id") ?? undefined,
    json?.error?.fields,
    retryAfter,
  );
}

export async function api<T>(method: "GET" | "POST" | "DELETE", path: string, opts: Options = {}): Promise<T> {
  // Only idempotent reads are retried automatically; mutations are never replayed blindly.
  const attempts = method === "GET" ? 3 : 1;
  let csrfRetried = false;
  for (let i = 0; ; i++) {
    try {
      return await once<T>(method, path, opts);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      if (err.code === "CSRF_INVALID" && !csrfRetried && path !== "/api/auth/session") {
        csrfRetried = true; // token went stale (e.g. session rotated in another tab): refresh once and retry
        try {
          const s = await once<{ csrfToken: string | null }>("GET", "/api/auth/session", {});
          setCsrfToken(s.csrfToken);
          continue;
        } catch {
          throw err;
        }
      }
      const transient = method === "GET" && i < attempts - 1 && (err.isNetwork || RETRYABLE.has(err.status));
      if (!transient) throw err;
      await sleep(300 * 3 ** i);
    }
  }
}

export const get = <T>(path: string, signal?: AbortSignal) => api<T>("GET", path, { signal });
export const post = <T>(path: string, body?: unknown) => api<T>("POST", path, { body });
export const del = <T>(path: string, body?: unknown) => api<T>("DELETE", path, { body });

/** Human-readable message with the support reference when we have one. */
export function describeError(err: unknown): { message: string; reference?: string } {
  if (err instanceof ApiError) {
    const wait =
      err.code === "RATE_LIMITED" && err.retryAfter ? ` Try again in ${err.retryAfter > 90 ? `${Math.ceil(err.retryAfter / 60)} minutes` : `${err.retryAfter} seconds`}.` : "";
    return { message: err.message + wait, reference: err.status >= 500 ? err.requestId : undefined };
  }
  return { message: "Something went wrong. Please try again." };
}
