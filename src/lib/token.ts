/**
 * Email links carry their one-time token in the URL *fragment* (#token=…), which browsers never send to
 * servers or in Referer headers. We read it once and immediately scrub it from the address bar/history.
 * The in-memory copy (per page path) only exists so React StrictMode's double render can't lose it.
 */
let cached: { path: string; token: string } | null = null;

export function readFragmentToken(): string | null {
  const path = window.location.pathname;
  const m = /(?:^#|&)token=([A-Za-z0-9_-]{16,200})(?:&|$)/.exec(window.location.hash);
  if (m) {
    cached = { path, token: m[1]! };
    window.history.replaceState(window.history.state, "", path + window.location.search);
    return m[1]!;
  }
  return cached?.path === path ? cached.token : null;
}
