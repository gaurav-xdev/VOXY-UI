import LazyOrb from "@/three/LazyOrb";
import Reveal from "@/components/Reveal";
import { Eyebrow, PillLink } from "@/ui/primitives";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

/** Custom 404. Pure client render: makes no API request and reuses the hero orb language. */
export default function NotFound() {
  useDocumentTitle("Page not found");
  return (
    <section className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-6 pt-24 text-center">
      <div className="pointer-events-none absolute inset-0 z-0 opacity-60">
        <LazyOrb className="mx-auto h-[min(720px,100svh)] w-full max-w-[900px]" />
      </div>
      <Reveal className="relative z-10 flex flex-col items-center">
        <Eyebrow>404 — NOT FOUND</Eyebrow>
        <h1 className="font-display mt-6 text-balance text-[13vw] font-medium leading-[0.95] tracking-tight text-white sm:text-[9vw] lg:text-[6.4vw]">
          <span className="block">This path</span>
          <span className="block italic text-white/80">doesn't exist.</span>
        </h1>
        <p className="mt-6 max-w-md text-balance text-[15px] leading-relaxed text-white/55">The page you're looking for was moved, never existed, or the link is mistyped.</p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <PillLink to="/">Return home</PillLink>
          <PillLink to="/contact" variant="secondary">
            Contact support
          </PillLink>
        </div>
      </Reveal>
    </section>
  );
}
