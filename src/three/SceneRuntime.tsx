import { useEffect, useMemo, useState, type ReactNode, type RefObject } from "react";
import { PerformanceMonitor } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { pointer } from "./pointer";
import { qualityStore, TIER, useQualityTier, type Tier } from "./quality";

/** True while the element is on (or near) screen AND the tab is visible. Drives all rendering. */
export function useSceneActive(ref: RefObject<Element | null>, rootMargin = "200px"): boolean {
  const [inView, setInView] = useState(false);
  const [tabVisible, setTabVisible] = useState(typeof document === "undefined" ? true : !document.hidden);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(Boolean(e?.isIntersecting)), { rootMargin });
    io.observe(el);
    const onVis = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [ref, rootMargin]);
  return inView && tabVisible;
}

/**
 * Drives the render loop (the Canvas uses frameloop="demand"):
 *  - inactive (off-screen / hidden tab) → zero renders, GPU idle
 *  - medium/low tiers → capped frame rate
 *  - `idleThrottle` → after a few seconds without pointer movement, ambient scenes drop to ~30fps
 */
export function FrameGovernor({ active, tier, idleThrottle = false }: { active: boolean; tier: Tier; idleThrottle?: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = 0;
    const cap = TIER[tier].maxFps;
    const loop = (t: number) => {
      const idle = idleThrottle && t - pointer.lastMove > 5000;
      const fps = idle ? Math.min(30, cap || 30) : cap;
      if (!fps || t - last >= 1000 / fps - 1) {
        last = t;
        invalidate();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, tier, invalidate, idleThrottle]);
  return null;
}

/** Steps quality down when measured fps falls below what the tier promises, and back up when it recovers. */
export function AdaptiveQuality({ children }: { children?: ReactNode }) {
  const tier = useQualityTier();
  const bounds = useMemo<[number, number]>(() => (tier === "high" ? [50, 90] : tier === "medium" ? [34, 60] : [20, 60]), [tier]);
  return (
    <PerformanceMonitor
      bounds={() => bounds}
      flipflops={3}
      onDecline={() => qualityStore.degrade()}
      onIncline={() => qualityStore.improve()}
      onFallback={() => {
        qualityStore.degrade();
        qualityStore.degrade();
      }}
    >
      {children}
    </PerformanceMonitor>
  );
}
