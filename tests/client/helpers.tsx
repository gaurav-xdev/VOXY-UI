import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router";
import { vi } from "vitest";

export interface Call {
  method: string;
  path: string;
  body: unknown;
  headers: Record<string, string>;
}
type Handler = (
  call: Call,
) => { status?: number; body?: unknown; headers?: Record<string, string> } | Promise<{ status?: number; body?: unknown; headers?: Record<string, string> }>;

/** Replaces global fetch with a scripted fake API. Unhandled calls fail loudly. */
export function mockApi(handlers: Record<string, Handler>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? "GET";
    const call: Call = { method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: (init?.headers ?? {}) as Record<string, string> };
    calls.push(call);
    const h = handlers[`${method} ${path}`];
    if (!h) throw new Error(`Unmocked API call: ${method} ${path}`);
    const r = await h(call);
    const status = r.status ?? 200;
    return new Response(r.body === undefined ? "" : typeof r.body === "string" ? r.body : JSON.stringify(r.body), {
      status,
      headers: { "content-type": "application/json", ...(r.headers ?? {}) },
    });
  });
  vi.stubGlobal("fetch", fn);
  return { calls, fn };
}

export const ok = <T,>(data: T, status = 200) => ({ status, body: { ok: true, data } });
export const fail = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) => ({
  status,
  body: { ok: false, error: { code, message, requestId: "req-test-123", ...extra } },
});

export function renderAt(routes: RouteObject[], entry: string) {
  const router = createMemoryRouter(routes, { initialEntries: [entry] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, client, ...utils };
}
