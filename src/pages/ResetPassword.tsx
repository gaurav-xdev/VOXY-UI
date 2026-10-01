import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import AuthShell from "@/ui/AuthShell";
import { Field, Notice, PillLink, PrimaryButton, TextLink } from "@/ui/primitives";
import { ApiError, describeError, post } from "@/lib/api";
import { useClearSession } from "@/lib/session";
import { readFragmentToken } from "@/lib/token";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

export default function ResetPassword() {
  useDocumentTitle("Choose a new password");
  // Read once on first render; the fragment is scrubbed from the URL immediately. StrictMode-safe via lazy state.
  const [token] = useState(() => readFragmentToken());
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const clear = useClearSession();
  const m = useMutation({
    mutationFn: () => post("/api/auth/reset-password", { token, password }),
    onSuccess: clear, // server revoked every session; make the UI agree
  });
  const fields = m.error instanceof ApiError ? m.error.fields : undefined;
  const mismatch = confirm.length > 0 && confirm !== password;

  if (!token)
    return (
      <AuthShell
        eyebrow="RESET"
        title="This link can't be used."
        intro="The reset link is incomplete or has already been used."
        footer={<TextLink to="/forgot-password">Request a new link</TextLink>}
      >
        <span />
      </AuthShell>
    );

  if (m.isSuccess)
    return (
      <AuthShell eyebrow="DONE" title="Password updated." intro="You've been signed out everywhere. Sign in with your new password.">
        <PillLink to="/login">Sign in</PillLink>
      </AuthShell>
    );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!m.isPending && !mismatch) m.mutate();
  };
  return (
    <AuthShell eyebrow="ACCOUNT" title="Choose a new password">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {m.error && !fields?.password && <Notice tone="error">{describeError(m.error).message}</Notice>}
        <Field
          label="New password"
          type="password"
          name="new-password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fields?.password}
          hint="At least 12 characters."
          disabled={m.isPending}
        />
        <Field
          label="Confirm password"
          type="password"
          name="confirm-password"
          autoComplete="new-password"
          required
          maxLength={128}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={mismatch ? "Passwords don't match." : undefined}
          disabled={m.isPending}
        />
        <PrimaryButton type="submit" busy={m.isPending} disabled={password.length < 12 || mismatch || !confirm}>
          Update password
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}
