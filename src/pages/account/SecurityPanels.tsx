import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, del, describeError, get, post } from "@/lib/api";
import type { SecurityEventRow, SessionData, SessionRow } from "@/lib/types";
import { useApplySession, useClearSession } from "@/lib/session";
import { DangerButton, Field, Notice, PrimaryButton, SecondaryButton, Skeleton } from "@/ui/primitives";
import { describeAgent, eventLabel, formatDateTime, isWarningEvent } from "./format";
import { useSensitive } from "./Reauth";

function ListSkeleton({ rows = 3, label }: { rows?: number; label: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-4">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-4 w-full max-w-sm" />
      ))}
    </div>
  );
}

function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <Notice tone="error">{describeError(error).message}</Notice>
      <SecondaryButton onClick={onRetry}>Retry</SecondaryButton>
    </div>
  );
}

export function SessionsPanel() {
  const qc = useQueryClient();
  const clear = useClearSession();
  const q = useQuery({ queryKey: ["sessions"], queryFn: ({ signal }) => get<{ sessions: SessionRow[] }>("/api/account/sessions", signal) });
  const revoke = useMutation({
    mutationFn: (id: string) => del(`/api/account/sessions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
  const sensitive = useSensitive();
  const everywhere = useMutation({
    mutationFn: () => sensitive(() => post("/api/account/logout-everywhere", {})),
    onSuccess: clear,
  });

  if (q.isPending) return <ListSkeleton label="Loading sessions" />;
  if (q.isError) return <LoadError error={q.error} onRetry={() => void q.refetch()} />;
  const sessions = q.data.sessions;
  const err = revoke.error ?? (everywhere.error instanceof ApiError && everywhere.error.code === "CANCELLED" ? null : everywhere.error);

  return (
    <div className="flex flex-col gap-5 text-left">
      {err && <Notice tone="error">{describeError(err).message}</Notice>}
      <ul className="divide-y divide-white/8">
        {sessions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="text-[14px] text-white">
                {describeAgent(s.userAgent)}
                {s.current && <span className="ml-2 rounded-full border border-ice/30 bg-ice/10 px-2 py-0.5 text-[10px] tracking-[0.15em] text-white/80">THIS DEVICE</span>}
              </p>
              <p className="mt-0.5 text-[12.5px] text-white/40">
                {s.ipAddress ?? "Unknown network"} · active {formatDateTime(s.lastSeenAt)}
              </p>
            </div>
            {!s.current && (
              <SecondaryButton className="px-4 py-2 text-[13px]" busy={revoke.isPending && revoke.variables === s.id} onClick={() => revoke.mutate(s.id)}>
                Sign out
              </SecondaryButton>
            )}
          </li>
        ))}
      </ul>
      {sessions.length > 1 && (
        <SecondaryButton className="self-start" busy={everywhere.isPending} onClick={() => everywhere.mutate()}>
          Sign out everywhere
        </SecondaryButton>
      )}
    </div>
  );
}

export function PasswordPanel() {
  const apply = useApplySession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [done, setDone] = useState(false);
  const m = useMutation({
    mutationFn: async () => {
      await post("/api/account/password", { currentPassword: current, newPassword: next });
      // The session was rotated by the server; pick up the new CSRF token.
      apply(await get<SessionData>("/api/auth/session"));
    },
    onSuccess: () => {
      setDone(true);
      setCurrent("");
      setNext("");
    },
  });
  const fields = m.error instanceof ApiError ? m.error.fields : undefined;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setDone(false);
    if (!m.isPending) m.mutate();
  };
  return (
    <form onSubmit={submit} className="flex max-w-sm flex-col gap-4" noValidate>
      {done && <Notice tone="success">Password changed. Your other devices were signed out.</Notice>}
      {m.error && !fields && <Notice tone="error">{describeError(m.error).message}</Notice>}
      <Field
        label="Current password"
        type="password"
        autoComplete="current-password"
        required
        maxLength={1024}
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        error={fields?.currentPassword}
        disabled={m.isPending}
      />
      <Field
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        minLength={12}
        maxLength={128}
        value={next}
        onChange={(e) => setNext(e.target.value)}
        error={fields?.newPassword}
        hint="At least 12 characters."
        disabled={m.isPending}
      />
      <PrimaryButton type="submit" busy={m.isPending} disabled={!current || next.length < 12} className="w-auto self-start">
        Change password
      </PrimaryButton>
    </form>
  );
}

export function ActivityPanel() {
  const q = useQuery({ queryKey: ["security-events"], queryFn: ({ signal }) => get<{ events: SecurityEventRow[] }>("/api/account/security-events", signal) });
  if (q.isPending) return <ListSkeleton rows={4} label="Loading activity" />;
  if (q.isError) return <LoadError error={q.error} onRetry={() => void q.refetch()} />;
  if (q.data.events.length === 0) return <p className="text-left text-[14px] text-white/55">No security activity recorded yet.</p>;
  return (
    <ul className="divide-y divide-white/8 text-left">
      {q.data.events.map((e, i) => (
        <li key={`${e.at}-${i}`} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
          <span className={isWarningEvent(e.type) ? "text-[14px] text-amber-200/90" : "text-[14px] text-white/85"}>{eventLabel(e.type)}</span>
          <span className="text-[12.5px] text-white/40">
            {formatDateTime(e.at)}
            {e.ip ? ` · ${e.ip}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function DeletePanel() {
  const clear = useClearSession();
  const sensitive = useSensitive();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const m = useMutation({ mutationFn: () => sensitive(() => del("/api/account", { confirm: "DELETE" })), onSuccess: clear });
  const cancelled = m.error instanceof ApiError && m.error.code === "CANCELLED";
  return (
    <div className="flex flex-col gap-4 text-left">
      <p className="text-[14px] leading-relaxed text-white/55">
        Deleting your account removes your sign-in and personal data from VOXY. This can't be undone. Active subscriptions should be cancelled first.
      </p>
      {m.error && !cancelled && <Notice tone="error">{describeError(m.error).message}</Notice>}
      {open ? (
        <div className="flex max-w-sm flex-col gap-3">
          <Field label="Type DELETE to confirm" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
          <div className="flex gap-3">
            <DangerButton busy={m.isPending} disabled={text !== "DELETE"} onClick={() => m.mutate()}>
              Delete my account
            </DangerButton>
            <SecondaryButton onClick={() => (setOpen(false), setText(""))}>Cancel</SecondaryButton>
          </div>
        </div>
      ) : (
        <DangerButton className="self-start" onClick={() => setOpen(true)}>
          Delete account…
        </DangerButton>
      )}
    </div>
  );
}
