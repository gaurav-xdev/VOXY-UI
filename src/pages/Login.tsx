import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { useMutation } from "@tanstack/react-query";
import AuthShell from "@/ui/AuthShell";
import { Field, Notice, PrimaryButton, TextLink } from "@/ui/primitives";
import { ApiError, describeError, post } from "@/lib/api";
import { safeNext, useApplySession, useSession } from "@/lib/session";
import type { SessionData } from "@/lib/types";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

export default function Login() {
  useDocumentTitle("Sign in");
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const navigate = useNavigate();
  const session = useSession();
  const apply = useApplySession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const login = useMutation({
    mutationFn: () => post<SessionData>("/api/auth/login", { email, password }),
    onSuccess: (s) => {
      apply(s);
      navigate(next, { replace: true });
    },
  });

  if (session.data?.user && !login.isPending) return <Navigate to={next} replace />;

  const err = login.error;
  const fields = err instanceof ApiError ? err.fields : undefined;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!login.isPending) login.mutate();
  };

  return (
    <AuthShell
      eyebrow="ACCOUNT"
      title="Sign in to VOXY"
      footer={
        <>
          New here? <TextLink to="/register">Create an account</TextLink>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {err && <Notice tone="error">{describeError(err).message}</Notice>}
        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fields?.email}
          disabled={login.isPending}
        />
        <Field
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          maxLength={1024}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fields?.password}
          disabled={login.isPending}
        />
        <PrimaryButton type="submit" busy={login.isPending} disabled={!email || !password}>
          Sign in
        </PrimaryButton>
        <TextLink to="/forgot-password" className="text-[13px]">
          Forgot your password?
        </TextLink>
      </form>
    </AuthShell>
  );
}
