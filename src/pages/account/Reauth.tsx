import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, describeError, get, post } from "@/lib/api";
import { useApplySession } from "@/lib/session";
import type { SessionData } from "@/lib/types";
import { Field, Notice, PrimaryButton, SecondaryButton } from "@/ui/primitives";
import GlassCard from "@/components/GlassCard";

type Runner = <T>(action: () => Promise<T>) => Promise<T>;
const Ctx = createContext<Runner | null>(null);

/** Runs a sensitive action; if the server says a recent password confirmation is needed, asks for it and retries once. */
export const useSensitive = (): Runner => {
  const r = useContext(Ctx);
  if (!r) throw new Error("useSensitive outside ReauthProvider");
  return r;
};

export function ReauthProvider({ children }: { children: ReactNode }) {
  const apply = useApplySession();
  const [pending, setPending] = useState<{ resolve: () => void; reject: (e: unknown) => void } | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const run: Runner = useCallback(async (action) => {
    try {
      return await action();
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== "REAUTH_REQUIRED") throw err;
      await new Promise<void>((resolve, reject) => setPending({ resolve, reject }));
      return action();
    }
  }, []);

  const cancel = useCallback(() => {
    pending?.reject(new ApiError(0, "CANCELLED", "Cancelled."));
    setPending(null);
    setPassword("");
    setError(null);
  }, [pending]);

  useEffect(() => {
    if (!pending) return;
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, cancel]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post("/api/auth/reauth", { password });
      // Re-auth rotates the session cookie, so the CSRF token (bound to the session id) changes too.
      apply(await get<SessionData>("/api/auth/session"));
      pending?.resolve();
      setPending(null);
      setPassword("");
    } catch (err) {
      setError(describeError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Ctx.Provider value={run}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && cancel()}>
          <div role="dialog" aria-modal="true" aria-labelledby="reauth-title" className="w-full max-w-sm">
            <GlassCard strong tilt={false} className="px-7 py-8">
              <form onSubmit={submit} className="flex flex-col gap-4">
                <h2 id="reauth-title" className="font-display text-2xl font-medium tracking-tight text-white">
                  Confirm it's you
                </h2>
                <p className="text-[13.5px] leading-relaxed text-white/55">Enter your password to continue with this change.</p>
                {error && <Notice tone="error">{error}</Notice>}
                <Field
                  ref={input}
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={1024}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <PrimaryButton type="submit" busy={busy} disabled={!password}>
                  Confirm
                </PrimaryButton>
                <SecondaryButton type="button" onClick={cancel}>
                  Cancel
                </SecondaryButton>
              </form>
            </GlassCard>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
