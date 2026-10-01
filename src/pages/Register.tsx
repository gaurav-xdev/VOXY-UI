import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import AuthShell from "@/ui/AuthShell";
import { Field, Notice, PrimaryButton, TextLink } from "@/ui/primitives";
import { ApiError, describeError, post } from "@/lib/api";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

export default function Register() {
  useDocumentTitle("Create account");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const register = useMutation({ mutationFn: () => post("/api/auth/register", { email, password }) });
  const resend = useMutation({ mutationFn: () => post("/api/auth/resend-verification", { email }) });
  const fields = register.error instanceof ApiError ? register.error.fields : undefined;

  if (register.isSuccess) {
    return (
      <AuthShell
        eyebrow="CHECK YOUR EMAIL"
        title="One more step."
        intro={`If ${email} can be used for a new account, we've sent a verification link there. It expires soon, and works once.`}
        footer={<TextLink to="/login">Back to sign in</TextLink>}
      >
        {resend.isSuccess ? <Notice tone="success">If that address is eligible, a new link is on its way.</Notice> : null}
        {resend.isError && <Notice tone="error">{describeError(resend.error).message}</Notice>}
        <button
          type="button"
          disabled={resend.isPending}
          onClick={() => resend.mutate()}
          className="text-[13px] text-white/60 underline decoration-white/20 underline-offset-4 hover:text-white disabled:opacity-50"
        >
          {resend.isPending ? "Sending…" : "Send the link again"}
        </button>
      </AuthShell>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!register.isPending) register.mutate();
  };

  return (
    <AuthShell
      eyebrow="ACCOUNT"
      title="Create your VOXY account"
      footer={
        <>
          Already have an account? <TextLink to="/login">Sign in</TextLink>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {register.error && !fields && <Notice tone="error">{describeError(register.error).message}</Notice>}
        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fields?.email}
          disabled={register.isPending}
        />
        <Field
          label="Password"
          type="password"
          name="new-password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fields?.password}
          hint="At least 12 characters. A passphrase works well."
          disabled={register.isPending}
        />
        <PrimaryButton type="submit" busy={register.isPending} disabled={!email || password.length < 12}>
          Create account
        </PrimaryButton>
        <p className="text-[12px] leading-relaxed text-white/35">
          By creating an account you agree to the <TextLink to="/terms">Terms</TextLink> and acknowledge the <TextLink to="/privacy">Privacy Notice</TextLink>.
        </p>
      </form>
    </AuthShell>
  );
}
