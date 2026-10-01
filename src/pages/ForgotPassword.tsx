import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import AuthShell from "@/ui/AuthShell";
import { Field, Notice, PrimaryButton, TextLink } from "@/ui/primitives";
import { describeError, post } from "@/lib/api";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

export default function ForgotPassword() {
  useDocumentTitle("Reset password");
  const [email, setEmail] = useState("");
  const m = useMutation({ mutationFn: () => post("/api/auth/forgot-password", { email }) });

  if (m.isSuccess)
    return (
      <AuthShell
        eyebrow="CHECK YOUR EMAIL"
        title="Reset link sent."
        intro="If an account exists for that address, a reset link is on its way. It expires soon and works once."
        footer={<TextLink to="/login">Back to sign in</TextLink>}
      >
        <span />
      </AuthShell>
    );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!m.isPending) m.mutate();
  };
  return (
    <AuthShell
      eyebrow="ACCOUNT"
      title="Reset your password"
      intro="Enter your email and we'll send a link to choose a new password."
      footer={<TextLink to="/login">Back to sign in</TextLink>}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        {m.error && <Notice tone="error">{describeError(m.error).message}</Notice>}
        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={m.isPending}
        />
        <PrimaryButton type="submit" busy={m.isPending} disabled={!email}>
          Send reset link
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}
