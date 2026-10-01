import { useEffect, useState } from "react";

/**
 * True once the browser has painted and is idle (or after `timeout`). Used to start downloading the heavy
 * 3D chunk AFTER the text/UI is visible, so it never competes with first paint.
 */
export function useAfterFirstPaint(timeout = 1200): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const go = () => !cancelled && setReady(true);
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const start = () => {
      if (ric) ric(go, { timeout });
      else setTimeout(go, 200);
    };
    // After the first frame has been committed to the screen.
    const raf = requestAnimationFrame(() => requestAnimationFrame(start));
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [timeout]);
  return ready;
}
