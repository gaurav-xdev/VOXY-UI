import { useSyncExternalStore } from "react";

/**
 * Device-aware quality. The ceiling comes from hardware hints; the live tier can only go
 * DOWN from that ceiling when measured frame rate drops (and recover when it improves).
 * `?q=high|medium|low` overrides detection (diagnostics only; purely cosmetic).
 */
export type Tier = "high" | "medium" | "low";
const ORDER: Tier[] = ["low", "medium", "high"];

interface NavigatorHints extends Navigator {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

export function detectCeiling(): Tier {
  if (typeof window === "undefined") return "medium";
  const forced = new URLSearchParams(window.location.search).get("q");
  if (forced === "high" || forced === "medium" || forced === "low") return forced;
  const n = navigator as NavigatorHints;
  const mem = n.deviceMemory ?? 8;
  const cores = n.hardwareConcurrency ?? 4;
  if (n.connection?.saveData || mem <= 2 || cores <= 2) return "low";
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (coarse || mem <= 4 || cores <= 4) return "medium";
  return "high";
}

export const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let ceiling: Tier = "high";
let current: Tier = "high";
let initialised = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function init() {
  if (initialised) return;
  initialised = true;
  ceiling = detectCeiling();
  current = ceiling;
}

export const qualityStore = {
  get: (): Tier => {
    init();
    return current;
  },
  ceiling: (): Tier => {
    init();
    return ceiling;
  },
  degrade() {
    init();
    const i = ORDER.indexOf(current);
    if (i > 0) {
      current = ORDER[i - 1]!;
      emit();
    }
  },
  improve() {
    init();
    const i = ORDER.indexOf(current);
    if (i < ORDER.indexOf(ceiling)) {
      current = ORDER[i + 1]!;
      emit();
    }
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export const useQualityTier = (): Tier => useSyncExternalStore(qualityStore.subscribe, qualityStore.get, () => "medium" as Tier);

export const TIER = {
  high: {
    dprBg: [1, 1.5],
    dprOrb: [1, 1.75],
    maxFps: 0,
    sparkBg: 140,
    sparkOrb: 70,
    shellDetail: 6,
    coreDetail: 12,
    transmission: { samples: 6, resolution: 512 },
    trails: 5,
    envRes: 256,
  },
  medium: {
    dprBg: [1, 1.25],
    dprOrb: [1, 1.25],
    maxFps: 45,
    sparkBg: 80,
    sparkOrb: 40,
    shellDetail: 5,
    coreDetail: 8,
    transmission: { samples: 4, resolution: 256 },
    trails: 4,
    envRes: 128,
  },
  low: { dprBg: [1, 1], dprOrb: [1, 1], maxFps: 30, sparkBg: 40, sparkOrb: 20, shellDetail: 4, coreDetail: 5, transmission: null, trails: 0, envRes: 64 },
} as const satisfies Record<Tier, unknown>;
