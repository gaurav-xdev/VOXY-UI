import Reveal from "@/components/Reveal";
import GlassCard from "@/components/GlassCard";
import { IconEye, IconNeural, IconWave, IconShield, IconOrbit } from "@/components/Icons";

export default function Intelligence() {
  return (
    <section id="intelligence" className="relative z-10 mx-auto max-w-6xl px-6 py-32">
      <Reveal className="mb-16 max-w-2xl">
        <span className="text-[11px] font-medium tracking-[0.3em] text-ice/70">01 — INTELLIGENCE</span>
        <h2 className="mt-5 font-display text-4xl font-medium leading-[1.05] tracking-tight text-white sm:text-5xl">
          A companion built from
          <br />
          <span className="text-white/40">five quiet disciplines.</span>
        </h2>
      </Reveal>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-6">
        <Reveal className="md:col-span-4" delay={0.05}>
          <GlassCard className="h-full p-9" strong>
            <div className="flex h-full flex-col justify-between gap-10">
              <div className="flex items-start justify-between">
                <IconEye className="h-10 w-10 text-white/85" />
                <span className="font-display text-xs text-white/30">/ 01</span>
              </div>
              <div>
                <h3 className="font-display text-2xl font-medium text-white">Ambient Awareness</h3>
                <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-white/55">
                  VOXY perceives context across your apps, screens, and moments — understanding intent
                  before you finish the thought, without ever feeling like it's watching.
                </p>
              </div>
            </div>
          </GlassCard>
        </Reveal>

        <Reveal className="md:col-span-2" delay={0.1}>
          <GlassCard className="h-full p-9">
            <div className="flex h-full flex-col justify-between gap-10">
              <IconNeural className="h-10 w-10 text-white/85" />
              <div>
                <h3 className="font-display text-xl font-medium text-white">Adaptive Memory</h3>
                <p className="mt-3 text-[14.5px] leading-relaxed text-white/55">
                  Every interaction sharpens a private model of you — evolving in real time.
                </p>
              </div>
            </div>
          </GlassCard>
        </Reveal>

        <Reveal className="md:col-span-2" delay={0.1}>
          <GlassCard className="h-full p-9">
            <div className="flex h-full flex-col justify-between gap-10">
              <IconWave className="h-10 w-10 text-white/85" />
              <div>
                <h3 className="font-display text-xl font-medium text-white">Natural Voice</h3>
                <p className="mt-3 text-[14.5px] leading-relaxed text-white/55">
                  Conversational, calm, human-paced — speech that never feels synthetic.
                </p>
              </div>
            </div>
          </GlassCard>
        </Reveal>

        <Reveal className="md:col-span-4" delay={0.15}>
          <GlassCard className="h-full p-9" strong>
            <div className="flex h-full flex-col justify-between gap-10">
              <div className="flex items-start justify-between">
                <IconShield className="h-10 w-10 text-white/85" />
                <span className="font-display text-xs text-white/30">/ 04</span>
              </div>
              <div>
                <h3 className="font-display text-2xl font-medium text-white">Secure Core</h3>
                <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-white/55">
                  On-device encryption and a closed private layer mean your intelligence never
                  leaves your ownership — not a product, a possession.
                </p>
              </div>
            </div>
          </GlassCard>
        </Reveal>

        <Reveal className="md:col-span-6" delay={0.2}>
          <GlassCard className="p-9">
            <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
              <div className="flex items-center gap-5">
                <IconOrbit className="h-12 w-12 text-white/85" />
                <div>
                  <h3 className="font-display text-xl font-medium text-white">Cross-Device Presence</h3>
                  <p className="mt-1 max-w-lg text-[14.5px] leading-relaxed text-white/55">
                    One continuous intelligence — present on your phone, your desk, your car, your home.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-white/35">
                {["Phone", "Desktop", "Wearable", "Home"].map((d) => (
                  <span key={d} className="rounded-full border border-white/10 px-3 py-1.5 text-[12px]">
                    {d}
                  </span>
                ))}
              </div>
            </div>
          </GlassCard>
        </Reveal>
      </div>
    </section>
  );
}
