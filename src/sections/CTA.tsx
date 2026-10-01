import { useState } from "react";
import Reveal from "@/components/Reveal";
import GlassCard from "@/components/GlassCard";
import Magnetic from "@/components/Magnetic";
import { IconArrowUpRight } from "@/components/Icons";
import { ApiError, describeError, post } from "@/lib/api";

export default function CTA() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await post("/api/waitlist", { email });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError && err.fields?.email ? err.fields.email : describeError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="access" className="relative z-10 mx-auto max-w-6xl px-6 py-32">
      <Reveal>
        <GlassCard strong className="overflow-hidden px-8 py-16 sm:px-16 sm:py-20">
          <div className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-ice/20 blur-[110px]" />
          <div className="relative flex flex-col items-center text-center">
            <span className="mb-6 text-[11px] font-medium tracking-[0.3em] text-white/45">04 — EARLY ACCESS</span>
            <h2 className="font-display max-w-2xl text-balance text-4xl font-medium leading-[1.05] tracking-tight text-white sm:text-5xl">Own tomorrow's intelligence. Today.</h2>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/55">
              VOXY is rolling out in private waves. Reserve your place in the operating layer of what comes next.
            </p>

            {sent ? (
              <div role="status" className="mt-9 rounded-full border border-ice/30 bg-ice/10 px-6 py-3 text-[14px] text-white">
                You're on the list — welcome to VOXY.
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!busy) void submit();
                }}
                className="mt-9 flex w-full max-w-md flex-col gap-3 sm:flex-row"
              >
                <input
                  required
                  type="email"
                  name="email"
                  autoComplete="email"
                  maxLength={254}
                  aria-label="Email address"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "waitlist-error" : undefined}
                  disabled={busy}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@domain.com"
                  data-cursor-text
                  className="w-full flex-1 rounded-full border border-white/15 bg-white/[0.05] px-5 py-3.5 text-[14px] text-white placeholder:text-white/35 outline-none backdrop-blur-md transition-colors focus:border-white/35"
                />
                <Magnetic strength={0.2}>
                  <button
                    type="submit"
                    disabled={busy}
                    aria-busy={busy || undefined}
                    className="disabled:opacity-60 group inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-[14px] font-medium text-graphite transition-transform active:scale-95 sm:w-auto"
                  >
                    {busy ? "Sending…" : "Request Access"}
                    <IconArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </button>
                </Magnetic>
              </form>
            )}

            {error && (
              <p id="waitlist-error" role="alert" className="mt-4 text-[13px] text-red-200/90">
                {error}
              </p>
            )}

            <p className="mt-5 text-[12px] tracking-wide text-white/30">No spam. No noise. Just an invitation.</p>
          </div>
        </GlassCard>
      </Reveal>
    </section>
  );
}
