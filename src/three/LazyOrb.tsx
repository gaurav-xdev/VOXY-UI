import { lazy, Suspense } from "react";
import { useAfterFirstPaint } from "./idle";

// three.js + r3f live in their own chunk; nothing 3D is downloaded until after first paint, and only when an orb mounts.
const Orb = lazy(() => import("./VoxyOrb"));

export default function LazyOrb({ className }: { className?: string }) {
  const ready = useAfterFirstPaint();
  const placeholder = <div className={className} aria-hidden="true" />;
  if (!ready) return placeholder;
  return (
    <Suspense fallback={placeholder}>
      <Orb className={className} />
    </Suspense>
  );
}
