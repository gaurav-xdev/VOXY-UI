import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { ApiError, describeError, get, post } from "@/lib/api";
import type { BillingSummary } from "@/lib/types";
import { Notice, PrimaryButton, SecondaryButton, Skeleton } from "@/ui/primitives";
import { formatDay } from "./format";

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  trialing: "Trial",
  past_due: "Payment overdue",
  unpaid: "Unpaid",
  canceled: "Canceled",
  incomplete: "Incomplete",
  incomplete_expired: "Expired",
  paused: "Paused",
};

/** Only follow provider-issued https URLs. The server created them; this is defence in depth. */
function go(url: string) {
  const u = new URL(url, window.location.origin);
  if (u.protocol !== "https:" && u.origin !== window.location.origin) throw new Error("Unexpected redirect target.");
  window.location.assign(u.toString());
}

export default function BillingPanel() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const returned = params.get("checkout");
  const [confirmCancel, setConfirmCancel] = useState(false);

  const q = useQuery({
    queryKey: ["billing"],
    queryFn: ({ signal }) => get<BillingSummary>("/api/billing", signal),
    // After returning from checkout the subscription arrives via webhook; poll briefly instead of faking it.
    refetchInterval: (query) => (returned === "success" && !query.state.data?.subscription && query.state.dataUpdateCount < 10 ? 3000 : false),
  });
  const polls = qc.getQueryState(["billing"])?.dataUpdateCount ?? 0;

  const redirecting = useMutation({
    mutationFn: async (req: { path: string; body: unknown }) => go((await post<{ url: string }>(req.path, req.body)).url),
  });
  const change = useMutation({
    mutationFn: (path: string) => post(path, {}),
    onSuccess: () => {
      setConfirmCancel(false);
      return qc.invalidateQueries({ queryKey: ["billing"] });
    },
  });

  if (q.isPending)
    return (
      <div role="status" aria-label="Loading billing" className="flex flex-col gap-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-64" />
      </div>
    );
  if (q.isError)
    return (
      <div className="flex flex-col items-start gap-3">
        <Notice tone="error">{describeError(q.error).message}</Notice>
        <SecondaryButton onClick={() => void q.refetch()}>Retry</SecondaryButton>
      </div>
    );

  const b = q.data;
  const sub = b.subscription;
  const err = redirecting.error ?? change.error;

  return (
    <div className="flex flex-col gap-4 text-left">
      {returned === "cancelled" && <Notice>Checkout was cancelled. You haven't been charged.</Notice>}
      {returned === "success" && !sub && (
        <Notice>
          {polls < 10
            ? "Thanks — we're waiting for the payment provider to confirm your subscription…"
            : "Your payment is still being confirmed. It will appear here shortly; refresh in a minute."}
        </Notice>
      )}
      {returned && (
        <button type="button" className="self-start text-[12px] text-white/35 underline underline-offset-4 hover:text-white/70" onClick={() => setParams({}, { replace: true })}>
          Dismiss
        </button>
      )}
      {err && <Notice tone="error">{err instanceof ApiError && err.code === "EMAIL_NOT_VERIFIED" ? "Verify your email before subscribing." : describeError(err).message}</Notice>}

      {sub ? (
        <>
          <div>
            <p className="font-display text-xl font-medium text-white">{sub.planLabel}</p>
            <p className="mt-1 text-[13.5px] text-white/55">
              {STATUS_LABEL[sub.status] ?? sub.status}
              {sub.currentPeriodEnd &&
                (sub.cancelAtPeriodEnd ? ` · ends ${formatDay(sub.currentPeriodEnd)}` : sub.status === "canceled" ? "" : ` · renews ${formatDay(sub.currentPeriodEnd)}`)}
            </p>
          </div>
          {sub.paymentIssue && <Notice tone="error">The last payment didn't go through. Update your payment method to keep access.</Notice>}
          {sub.cancelAtPeriodEnd && <Notice>Cancellation is scheduled. You keep access until the end of the paid period.</Notice>}
          <div className="flex flex-wrap gap-3">
            <SecondaryButton busy={redirecting.isPending} onClick={() => redirecting.mutate({ path: "/api/billing/portal", body: {} })}>
              {sub.paymentIssue ? "Update payment method" : "Manage billing"}
            </SecondaryButton>
            {sub.status !== "canceled" &&
              (sub.cancelAtPeriodEnd ? (
                <SecondaryButton busy={change.isPending} onClick={() => change.mutate("/api/billing/resume")}>
                  Keep my subscription
                </SecondaryButton>
              ) : confirmCancel ? (
                <>
                  <SecondaryButton busy={change.isPending} onClick={() => change.mutate("/api/billing/cancel")}>
                    Confirm cancellation
                  </SecondaryButton>
                  <button type="button" onClick={() => setConfirmCancel(false)} className="text-[13px] text-white/50 hover:text-white">
                    Never mind
                  </button>
                </>
              ) : (
                <SecondaryButton onClick={() => setConfirmCancel(true)}>Cancel subscription</SecondaryButton>
              ))}
          </div>
        </>
      ) : !b.billingEnabled || b.plans.length === 0 ? (
        <p className="text-[14px] leading-relaxed text-white/55">Paid plans aren't available yet. There's nothing to manage here.</p>
      ) : (
        <>
          <p className="text-[14px] leading-relaxed text-white/55">You're not subscribed to a plan.</p>
          {!b.emailVerified && <Notice>Verify your email address to subscribe.</Notice>}
          <div className="flex flex-wrap gap-3">
            {b.plans.map((p) => (
              <PrimaryButton
                key={p.key}
                className="w-auto"
                busy={redirecting.isPending}
                disabled={!b.emailVerified}
                onClick={() => redirecting.mutate({ path: "/api/billing/checkout", body: { plan: p.key } })}
              >
                Subscribe — {p.label}
              </PrimaryButton>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
