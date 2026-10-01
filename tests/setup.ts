import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

// Browser-only shims, applied only in the jsdom (client) project files.
if (typeof window !== "undefined") {
  class IO {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver ??= IO;
  window.matchMedia ??= ((q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  window.scrollTo = () => {};
  Element.prototype.scrollIntoView ??= () => {};
  afterEach(async () => {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  });
}
