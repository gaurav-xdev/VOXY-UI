import type { ReactNode } from "react";
import Reveal from "@/components/Reveal";
import GlassCard from "@/components/GlassCard";
import { Eyebrow } from "./primitives";

/** Centered glass card on the VOXY backdrop. Same composition as the landing "Early Access" card. */
export default function AuthShell({ eyebrow, title, intro, children, footer }: { eyebrow: string; title: string; intro?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="relative z-10 mx-auto flex min-h-[100svh] max-w-6xl items-center justify-center px-6 pb-20 pt-32">
      <Reveal className="w-full max-w-md">
        <GlassCard strong tilt={false} className="px-8 py-12 sm:px-10">
          <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[26rem] -translate-x-1/2 rounded-full bg-ice/15 blur-[90px]" />
          <div className="relative flex flex-col text-center">
            <Eyebrow>{eyebrow}</Eyebrow>
            <h1 className="mt-5 text-balance font-display text-3xl font-medium leading-[1.1] tracking-tight text-white sm:text-4xl">{title}</h1>
            {intro && <p className="mt-4 text-[14.5px] leading-relaxed text-white/55">{intro}</p>}
            <div className="mt-8 flex flex-col gap-4">{children}</div>
            {footer && <div className="mt-7 text-[13px] text-white/45">{footer}</div>}
          </div>
        </GlassCard>
      </Reveal>
    </section>
  );
}
