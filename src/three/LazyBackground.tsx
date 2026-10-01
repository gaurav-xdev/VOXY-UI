import { lazy, Suspense } from "react";
import { useAfterFirstPaint } from "./idle";

const Background = lazy(() => import("./BackgroundScene"));

export default function LazyBackground() {
  const ready = useAfterFirstPaint();
  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <Background />
    </Suspense>
  );
}
