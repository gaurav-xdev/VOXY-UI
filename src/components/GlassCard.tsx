import { useRef, type ReactNode, type MouseEvent } from "react";
import { motion, useMotionTemplate, useMotionValue, useSpring } from "framer-motion";
import { cn } from "@/utils/cn";

export default function GlassCard({
  children,
  className,
  tilt = true,
  strong = false,
}: {
  children: ReactNode;
  className?: string;
  tilt?: boolean;
  strong?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(50);
  const my = useMotionValue(50);
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 150, damping: 16 });
  const sry = useSpring(ry, { stiffness: 150, damping: 16 });
  const bg = useMotionTemplate`radial-gradient(320px circle at ${mx}% ${my}%, rgba(255,255,255,0.14), transparent 65%)`;

  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * 100;
    const py = ((e.clientY - rect.top) / rect.height) * 100;
    mx.set(px);
    my.set(py);
    if (tilt) {
      ry.set(((e.clientX - rect.left) / rect.width - 0.5) * 6);
      rx.set(-((e.clientY - rect.top) / rect.height - 0.5) * 6);
    }
  };

  const handleLeave = () => {
    mx.set(50);
    my.set(50);
    rx.set(0);
    ry.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ rotateX: srx, rotateY: sry, transformPerspective: 900 }}
      className={cn(
        "group relative overflow-hidden rounded-[28px]",
        strong ? "glass-panel-strong" : "glass-panel",
        className
      )}
    >
      <motion.div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ backgroundImage: bg }}
      />
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
      <div className="relative">{children}</div>
    </motion.div>
  );
}
