import { useEffect, useRef } from "react";
import gsap from "gsap";
import VoxyOrb from "@/three/VoxyOrb";
import Magnetic from "@/components/Magnetic";
import { IconArrowUpRight, IconChevronDown } from "@/components/Icons";

export default function Hero() {
  const scope = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      tl.fromTo(
        ".hero-line > span",
        { yPercent: 120, rotate: 3 },
        { yPercent: 0, rotate: 0, duration: 1.4, stagger: 0.12 }
      )
        .fromTo(".hero-orb", { opacity: 0, scale: 0.82 }, { opacity: 1, scale: 1, duration: 1.8 }, 0.15)
        .fromTo(".hero-sub", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 1 }, "-=1")
        .fromTo(".hero-cta > *", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.1 }, "-=0.7")
        .fromTo(".hero-badge", { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.8 }, "-=1.6")
        .fromTo(".hero-scroll", { opacity: 0 }, { opacity: 1, duration: 1 }, "-=0.3");
    }, scope);
    return () => ctx.revert();
  }, []);

  return (
    <section id="top" ref={scope} className="relative flex min-h-[100svh] flex-col justify-center overflow-hidden px-6 pt-28">
      <div className="hero-orb pointer-events-none absolute inset-0 z-0 opacity-0">
        <VoxyOrb className="mx-auto h-[720px] w-full max-w-[1100px] translate-y-[-2%]" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center text-center">
        <div className="hero-badge mb-8 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-1.5 backdrop-blur-md">
          <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-ice" />
          <span className="text-[11px] font-medium tracking-[0.25em] text-white/60">THE AI OPERATING COMPANION</span>
        </div>

        <h1 className="font-display text-[13vw] font-medium leading-[0.95] tracking-tight text-white sm:text-[9vw] lg:text-[6.4vw]">
          <span className="hero-line block overflow-hidden">
            <span className="block">Intelligence,</span>
          </span>
          <span className="hero-line block overflow-hidden">
            <span className="block bg-gradient-to-b from-white via-white to-white/40 bg-clip-text text-transparent">
              engineered to feel
            </span>
          </span>
          <span className="hero-line block overflow-hidden">
            <span className="block italic text-white/90">alive.</span>
          </span>
        </h1>

        <p className="hero-sub mx-auto mt-8 max-w-xl text-balance text-[15px] leading-relaxed text-white/55 sm:text-base">
          VOXY is not an assistant you talk to. It's an operating layer that perceives, remembers,
          and acts alongside you — quietly, continuously, everywhere you go.
        </p>

        <div className="hero-cta mt-10 flex flex-wrap items-center justify-center gap-4">
          <Magnetic>
            <a
              href="#access"
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-white px-7 py-3.5 text-[14px] font-medium text-graphite shadow-[0_20px_60px_-15px_rgba(255,255,255,0.4)] transition-transform duration-300 active:scale-95"
            >
              Experience VOXY
              <IconArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </Magnetic>
          <Magnetic strength={0.25}>
            <a
              href="#engineering"
              className="glass-panel inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[14px] font-medium text-white/85 transition-colors duration-300 hover:text-white"
            >
              Watch the Film
            </a>
          </Magnetic>
        </div>
      </div>

      <div className="hero-scroll pointer-events-none absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2 opacity-0">
        <span className="text-[10px] font-medium tracking-[0.3em] text-white/35">SCROLL</span>
        <IconChevronDown className="h-4 w-4 animate-bounce text-white/35" />
      </div>
    </section>
  );
}
