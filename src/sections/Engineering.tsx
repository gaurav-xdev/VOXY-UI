import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import VoxyOrb from "@/three/LazyOrb";
import Reveal from "@/components/Reveal";

const MATERIALS = [
  { label: "Shell", value: "Liquid Glass · IOR 1.25" },
  { label: "Core", value: "White Plasma · Adaptive Distortion" },
  { label: "Lattice", value: "Structural Wireframe · 1.9x Radius" },
  { label: "Field", value: "Magnetic Particle Orbits ×3" },
  { label: "Light", value: "Volumetric Rim + Bloom" },
];

export default function Engineering() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [60, -60]);
  const rotate = useTransform(scrollYProgress, [0, 1], [-4, 4]);

  return (
    <section id="engineering" ref={ref} className="relative z-10 overflow-hidden py-32">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-16 px-6 lg:grid-cols-2">
        <div>
          <Reveal>
            <span className="text-[11px] font-medium tracking-[0.3em] text-ice/70">03 — ENGINEERING</span>
            <h2 className="mt-5 font-display text-4xl font-medium leading-[1.05] tracking-tight text-white sm:text-5xl">
              Every reflection
              <br />
              <span className="text-white/40">is deliberate.</span>
            </h2>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-white/55">
              The VOXY core isn't a graphic — it's a simulated material. Layered transmission,
              chromatic refraction, and a living plasma center combine into an object that reacts
              to light the way glass and energy actually do.
            </p>
          </Reveal>

          <Reveal delay={0.15} className="mt-10 space-y-0 divide-y divide-white/8 border-y border-white/8">
            {MATERIALS.map((m) => (
              <div key={m.label} className="flex items-center justify-between py-4">
                <span className="text-[13px] font-medium tracking-wide text-white/40">{m.label}</span>
                <span className="font-display text-[14px] text-white/85">{m.value}</span>
              </div>
            ))}
          </Reveal>
        </div>

        <motion.div style={{ y, rotate }} className="relative">
          <div className="absolute inset-0 -z-10 rounded-full bg-ice/10 blur-[120px]" />
          <VoxyOrb className="mx-auto h-[460px] w-full max-w-[520px]" />
        </motion.div>
      </div>
    </section>
  );
}
