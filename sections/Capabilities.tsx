import Reveal from "@/components/Reveal";
import { IconInfinity, IconLayers, IconSync, IconSpark } from "@/components/Icons";

const ROWS = [
  {
    n: "01",
    title: "Perceive",
    desc: "VOXY reads context the way a person would — tone, timing, environment — fusing signal from every surface into one continuous understanding.",
    Icon: IconLayers,
  },
  {
    n: "02",
    title: "Understand",
    desc: "Raw signal becomes meaning. VOXY's private model reasons over your intent, your history, and your goals before it ever responds.",
    Icon: IconSpark,
  },
  {
    n: "03",
    title: "Act",
    desc: "From a single word, VOXY orchestrates across your tools and devices — quietly executing, never interrupting.",
    Icon: IconSync,
  },
  {
    n: "04",
    title: "Evolve",
    desc: "The system compounds. Every day VOXY becomes a more precise reflection of how you think and work.",
    Icon: IconInfinity,
  },
];

export default function Capabilities() {
  return (
    <section id="capabilities" className="relative z-10 mx-auto max-w-6xl px-6 py-32">
      <Reveal className="mb-16 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
        <div>
          <span className="text-[11px] font-medium tracking-[0.3em] text-aurora/70">02 — CAPABILITIES</span>
          <h2 className="mt-5 max-w-xl font-display text-4xl font-medium leading-[1.05] tracking-tight text-white sm:text-5xl">
            One loop, running <span className="text-white/40">forever.</span>
          </h2>
        </div>
        <p className="max-w-xs text-[14px] leading-relaxed text-white/45">
          Four disciplines fused into a single, continuous cognitive loop — not four separate features.
        </p>
      </Reveal>

      <div className="divide-y divide-white/8 border-y border-white/8">
        {ROWS.map((row, i) => (
          <Reveal key={row.n} delay={i * 0.08}>
            <div className="group grid grid-cols-1 items-center gap-6 py-10 transition-colors duration-500 md:grid-cols-12">
              <div className="md:col-span-2">
                <span className="font-display text-sm text-white/30">{row.n}</span>
              </div>
              <div className="flex items-center gap-4 md:col-span-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] transition-all duration-500 group-hover:border-ice/40 group-hover:bg-white/[0.08]">
                  <row.Icon className="h-6 w-6 text-white/80" />
                </span>
                <h3 className="font-display text-2xl font-medium text-white">{row.title}</h3>
              </div>
              <p className="text-[14.5px] leading-relaxed text-white/50 md:col-span-7">{row.desc}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
