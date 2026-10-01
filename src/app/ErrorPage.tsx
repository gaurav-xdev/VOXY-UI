import { Component, type ErrorInfo, type ReactNode } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router";
import { ApiError } from "@/lib/api";

/**
 * Last-resort screens. Deliberately dependency-light (no router Link, no 3D, no API calls) so they
 * keep working when the thing that broke is the router, the layout, or a lazy chunk. Never shows
 * stack traces, messages from thrown errors, SQL, or paths: only a safe sentence and a reference.
 */

function reference(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.requestId;
  return undefined;
}

function isChunkError(error: unknown) {
  const msg = error instanceof Error ? `${error.name} ${error.message}` : "";
  return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|error loading dynamically imported module/i.test(msg);
}

export function ErrorScreen({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const chunk = isChunkError(error);
  const ref = reference(error);
  const title = chunk ? "A new version is available." : "Something went wrong.";
  const body = chunk ? "Reload to get the latest version of VOXY." : "That wasn't supposed to happen. Nothing you did caused it. You can retry, or head back home.";
  return (
    <div role="alert" className="relative z-10 mx-auto flex min-h-[100svh] max-w-xl flex-col items-center justify-center px-6 text-center text-white">
      <span className="text-[11px] font-medium tracking-[0.3em] text-white/45">UNEXPECTED ERROR</span>
      <h1 className="font-display mt-5 text-balance text-4xl font-medium leading-[1.1] tracking-tight sm:text-5xl">{title}</h1>
      <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/55">{body}</p>
      {ref && <p className="mt-4 text-[12px] tracking-wide text-white/35">Reference: {ref}</p>}
      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => (chunk || !onRetry ? window.location.reload() : onRetry())}
          className="rounded-full bg-white px-6 py-3.5 text-[14px] font-medium text-graphite transition-transform active:scale-95"
        >
          {chunk || !onRetry ? "Reload" : "Try again"}
        </button>
        <a href="/" className="rounded-full border border-white/15 bg-white/[0.06] px-6 py-3.5 text-[14px] font-medium text-white/85 transition-colors hover:text-white">
          Back to home
        </a>
      </div>
    </div>
  );
}

/** Route-level errorElement (loader/render/lazy-chunk failures inside the router). */
export function RouteErrorPage() {
  const error = useRouteError();
  if (import.meta.env.DEV) console.error(error);
  if (isRouteErrorResponse(error) && error.status === 404) return null; // handled by the "*" route
  return (
    <div className="min-h-screen bg-void">
      <ErrorScreen error={error} />
    </div>
  );
}

/** Outermost boundary, outside the router and providers. */
export class GlobalErrorBoundary extends Component<{ children: ReactNode }, { error: unknown; failed: boolean }> {
  state = { error: null as unknown, failed: false };
  static getDerivedStateFromError(error: unknown) {
    return { error, failed: true };
  }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error(error, info.componentStack);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="min-h-screen bg-void">
        <ErrorScreen error={this.state.error} onRetry={() => this.setState({ error: null, failed: false })} />
      </div>
    );
  }
}
