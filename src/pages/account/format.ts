const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const dayFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "long" });

export const formatDateTime = (iso: string) => dateFmt.format(new Date(iso));
export const formatDay = (iso: string) => dayFmt.format(new Date(iso));

export function describeAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iOS/.test(ua)
        ? "iOS"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Unknown OS";
  return `${browser} on ${os}`;
}

const EVENT_LABELS: Record<string, string> = {
  account_created: "Account created",
  email_verified: "Email verified",
  login_succeeded: "Signed in",
  login_new_ip: "Sign-in from a new network",
  login_after_failures: "Signed in after failed attempts",
  login_failed: "Failed sign-in attempt",
  login_blocked: "Sign-in blocked",
  login_rate_limited: "Sign-in attempts rate limited",
  logout: "Signed out",
  password_reset_requested: "Password reset requested",
  password_reset_completed: "Password reset completed",
  password_changed: "Password changed",
  reauthenticated: "Password confirmed",
  reauth_failed: "Failed password confirmation",
  session_revoked: "Session revoked",
  sessions_revoked_all: "Signed out of all devices",
};
export const eventLabel = (type: string) => EVENT_LABELS[type] ?? type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
export const isWarningEvent = (type: string) => /failed|blocked|rate_limited|new_ip|after_failures/.test(type);
