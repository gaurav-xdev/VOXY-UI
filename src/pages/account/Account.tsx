import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useMutation } from "@tanstack/react-query";
import Reveal from "@/components/Reveal";
import GlassCard from "@/components/GlassCard";
import { Eyebrow, Notice, SecondaryButton, Skeleton } from "@/ui/primitives";
import { describeError, post } from "@/lib/api";
import { useClearSession, useSession } from "@/lib/session";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import BillingPanel from "./BillingPanel";
import { ActivityPanel, DeletePanel, PasswordPanel, SessionsPanel } from "./SecurityPanels";
import { ReauthProvider } from "./Reauth";
import { useState } from "react";

function Panel({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <Reveal>
      <GlassCard tilt={false} className="px-7 py-8 sm:px-9">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="font-display mb-6 mt-3 text-2xl font-medium tracking-tight text-white">{title}</h2>
        {children}
      </GlassCard>
    </Reveal>
  );
}

function AccountSkeleton() {
  return (
    <section className="relative z-10 mx-auto max-w-3xl px-6 pb-24 pt-32" role="status" aria-label="Loading your account">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-5 h-10 w-72" />
      <Skeleton className="mt-4 h-3 w-56" />
      <div className="mt-10 flex flex-col gap-6">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-52 w-full rounded-3xl" />
      </div>
    </section>
  );
}

export default function Account() {
  useDocumentTitle("Account");
  const session = useSession();
  const loc = useLocation();
  const clear = useClearSession();
  const logout = useMutation({ mutationFn: () => post("/api/auth/logout", {}), onSettled: clear });
  const [resent, setResent] = useState(false);
  const resend = useMutation({ mutationFn: (email: string) => post("/api/auth/resend-verification", { email }), onSuccess: () => setResent(true) });

  if (session.isPending) return <AccountSkeleton />;
  if (session.isError)
    return (
      <section className="relative z-10 mx-auto flex min-h-[70svh] max-w-md flex-col items-center justify-center gap-4 px-6 pt-24 text-center">
        <Notice tone="error">{describeError(session.error).message}</Notice>
        <SecondaryButton onClick={() => void session.refetch()}>Retry</SecondaryButton>
      </section>
    );
  const user = session.data.user;
  // The server is the authority; this redirect is only UX. Every API call below is authorised server-side.
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;

  return (
    <ReauthProvider>
      <section className="relative z-10 mx-auto max-w-3xl px-6 pb-24 pt-32">
        <Reveal>
          <Eyebrow>ACCOUNT</Eyebrow>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-4xl font-medium leading-[1.05] tracking-tight text-white sm:text-5xl">Your account</h1>
              <p className="mt-3 text-[14.5px] text-white/55">{user.email}</p>
            </div>
            <SecondaryButton busy={logout.isPending} onClick={() => logout.mutate()}>
              Sign out
            </SecondaryButton>
          </div>
        </Reveal>

        {!user.emailVerified && (
          <div className="mt-8 flex flex-col items-start gap-3">
            <Notice>Your email address isn't verified yet. Check your inbox for the link, or request a new one.</Notice>
            {resent ? <Notice tone="success">If your address is unverified, a new link is on its way.</Notice> : null}
            {resend.error && <Notice tone="error">{describeError(resend.error).message}</Notice>}
            {!resent && (
              <SecondaryButton busy={resend.isPending} onClick={() => resend.mutate(user.email)}>
                Resend verification email
              </SecondaryButton>
            )}
          </div>
        )}

        <div className="mt-10 flex flex-col gap-6">
          <Panel eyebrow="01 — PLAN" title="Subscription & billing">
            <BillingPanel />
          </Panel>
          <Panel eyebrow="02 — DEVICES" title="Where you're signed in">
            <SessionsPanel />
          </Panel>
          <Panel eyebrow="03 — SECURITY" title="Password">
            <PasswordPanel />
          </Panel>
          <Panel eyebrow="04 — ACTIVITY" title="Recent security activity">
            <ActivityPanel />
          </Panel>
          <Panel eyebrow="05 — DANGER ZONE" title="Delete account">
            <DeletePanel />
          </Panel>
        </div>
      </section>
    </ReauthProvider>
  );
}
