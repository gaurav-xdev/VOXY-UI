import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import AuthShell from "@/ui/AuthShell";
import { Field, Notice, PillLink, PrimaryButton, Skeleton } from "@/ui/primitives";
import { describeError, post } from "@/lib/api";
import { SESSION_KEY } from "@/lib/session";
import { readFragmentToken } from "@/lib/token";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

type State = { kind: "working" } | { kind: "done" } | { kind: "failed"; message: string } | { kind: "missing" };

// The token is single-use: share one in-flight request so React StrictMode's double effect can't burn it.
const inflight = new Map<string, Promise<unknown>>();

export default function VerifyEmail() {
  useDocumentTitle("Verify email");
  const qc = useQueryClient();
  const [token] = useState(() => readFragmentToken());
  const [state, setState] = useState<State>(token ? { kind: "working" } : { kind: "missing" });
  const [email, setEmail] = useState("");
  const [resent, setResent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let live = true;
    const p = inflight.get(token) ?? post("/api/auth/verify-email", { token });
    inflight.set(token, p);
    p.then(
      () => {
        if (!live) return;
        void qc.invalidateQueries({ queryKey: SESSION_KEY });
        setState({ kind: "done" });
      },
      (err) => live && setState({ kind: "failed", message: describeError(err).message }),
    );
    return () => {
      live = false;
    };
  }, [qc, token]);

  if (state.kind === "working")
    return (
      <AuthShell eyebrow="VERIFYING" title="Confirming your email…">
        <div role="status" aria-label="Verifying" className="flex flex-col items-center gap-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
      </AuthShell>
    );

  if (state.kind === "done")
    return (
      <AuthShell eyebrow="VERIFIED" title="Your email is confirmed." intro="Your account is ready.">
        <PillLink to="/account">Go to your account</PillLink>
      </AuthShell>
    );

  return (
    <AuthShell eyebrow="VERIFICATION" title="This link can't be used." intro={state.kind === "failed" ? state.message : "The verification link is incomplete."}>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setResendError(null);
          try {
            await post("/api/auth/resend-verification", { email });
            setResent(true);
          } catch (err) {
            setResendError(describeError(err).message);
          }
        }}
      >
        {resent && <Notice tone="success">If that address has an unverified account, a new link is on its way.</Notice>}
        {resendError && <Notice tone="error">{resendError}</Notice>}
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <PrimaryButton type="submit" disabled={!email}>
          Send a new link
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}
