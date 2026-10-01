import type { ReactNode } from "react";
import Reveal from "@/components/Reveal";
import { Eyebrow, Notice, Skeleton, TextLink } from "@/ui/primitives";
import { usePublicConfig } from "@/lib/session";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import type { PublicConfig } from "@/lib/types";

export type Legal = PublicConfig["legal"];

/** A value that must come from the business. Never invented: if unset, say so visibly. */
export function Configured({ value, label }: { value: string | null | undefined; label: string }) {
  if (value) return <>{value}</>;
  return <span className="rounded bg-amber-200/10 px-1.5 text-amber-100/80">[{label}: not yet provided by the operator]</span>;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-medium tracking-tight text-white">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-white/60">{children}</div>
    </section>
  );
}

export default function LegalLayout({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro?: ReactNode; children: (legal: Legal) => ReactNode }) {
  useDocumentTitle(title);
  const q = usePublicConfig();
  return (
    <article className="relative z-10 mx-auto max-w-3xl px-6 pb-24 pt-36">
      <Reveal>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="font-display mt-5 text-4xl font-medium leading-[1.05] tracking-tight text-white sm:text-5xl">{title}</h1>
        {intro && <p className="mt-5 text-[15.5px] leading-relaxed text-white/60">{intro}</p>}
      </Reveal>

      {q.isPending && (
        <div role="status" aria-label="Loading" className="mt-10 flex flex-col gap-3">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      )}
      {q.isError && (
        <div className="mt-10">
          <Notice tone="error">We couldn't load this page's company details. Please refresh and try again.</Notice>
        </div>
      )}
      {q.data && (
        <>
          {!q.data.legal.reviewed && (
            <div className="mt-8">
              <Notice>
                <strong className="font-medium text-white">Draft — pending review.</strong> This text describes how the service works technically. It has not yet been reviewed by
                the business or its legal advisers and is not final legal wording.
              </Notice>
            </div>
          )}
          <div className="mt-2">{children(q.data.legal)}</div>
          <p className="mt-14 border-t border-white/8 pt-6 text-[12.5px] text-white/35">
            Effective date: <Configured value={q.data.legal.effectiveDate} label="effective date" /> · Operator:{" "}
            <Configured value={q.data.legal.companyName} label="company name" /> · <TextLink to="/contact">Contact</TextLink>
          </p>
        </>
      )}
    </article>
  );
}
