import Reveal from "@/components/Reveal";

export default function Quote() {
  return (
    <section className="relative z-10 mx-auto max-w-5xl px-6 py-40 text-center">
      <Reveal>
        <p className="font-display text-balance text-3xl font-medium leading-[1.3] tracking-tight text-white sm:text-4xl lg:text-[3.4rem]">
          "We didn't want to build something you talk to.
          <br className="hidden sm:block" />
          We wanted to build something that
          <span className="bg-gradient-to-r from-ice via-white to-aurora bg-clip-text text-transparent"> thinks beside you.</span>"
        </p>
      </Reveal>
      <Reveal delay={0.2} className="mt-8 flex items-center justify-center gap-3">
        <span className="h-px w-8 bg-white/25" />
        <span className="text-[12px] font-medium tracking-[0.3em] text-white/40">VOXY DESIGN PHILOSOPHY</span>
        <span className="h-px w-8 bg-white/25" />
      </Reveal>
    </section>
  );
}
