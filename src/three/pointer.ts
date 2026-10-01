import { useEffect } from "react";

/**
 * One shared, passive pointer tracker (normalised -1..1 over the viewport). Scenes read it
 * from useFrame instead of each attaching listeners, and it works even when a canvas sits
 * under `pointer-events-none` (the hero orb), which r3f's own `pointer` can't.
 */
export const pointer = { x: 0, y: 0, lastMove: 0 };
let refs = 0;
let handler: ((e: PointerEvent) => void) | null = null;

export function usePointerTracker() {
  useEffect(() => {
    if (refs++ === 0) {
      handler = (e: PointerEvent) => {
        pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
        pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
        pointer.lastMove = performance.now();
      };
      window.addEventListener("pointermove", handler, { passive: true });
    }
    return () => {
      if (--refs === 0 && handler) window.removeEventListener("pointermove", handler);
    };
  }, []);
}
