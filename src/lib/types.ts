export interface SessionUser {
  email: string;
  emailVerified: boolean;
  role: string;
}
export interface SessionData {
  user: SessionUser | null;
  csrfToken: string | null;
}
export interface PublicConfig {
  legal: {
    companyName: string | null;
    companyAddress: string | null;
    registrationNumber: string | null;
    contactEmail: string | null;
    supportEmail: string | null;
    privacyEmail: string | null;
    jurisdiction: string | null;
    effectiveDate: string | null;
    reviewed: boolean;
  };
  billingEnabled: boolean;
}
export interface BillingSummary {
  billingEnabled: boolean;
  plans: { key: string; label: string }[];
  emailVerified: boolean;
  subscription: null | {
    planKey: string;
    planLabel: string;
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
    paymentIssue: boolean;
  };
  entitlements: string[];
}
export interface SessionRow {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  current: boolean;
}
export interface SecurityEventRow {
  type: string;
  at: string;
  ip: string | null;
}
