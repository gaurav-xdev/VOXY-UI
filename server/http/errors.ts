/**
 * Normalised application errors. Anything that is NOT an AppError is treated as an
 * unexpected failure: it is logged server-side with the request id and the client only
 * ever receives a generic message + the request id.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly opts: { headers?: Record<string, string>; fields?: Record<string, string>; log?: "warn" | "error" | "none" } = {},
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  badRequest: (message = "The request was invalid.") => new AppError(400, "BAD_REQUEST", message),
  validation: (fields: Record<string, string>) => new AppError(422, "VALIDATION_ERROR", "Some fields need attention.", { fields }),
  unauthenticated: () => new AppError(401, "UNAUTHENTICATED", "Please sign in to continue."),
  forbidden: () => new AppError(403, "FORBIDDEN", "You don't have permission to do that."),
  csrf: () => new AppError(403, "CSRF_INVALID", "This request could not be verified. Please reload the page and try again."),
  reauth: () => new AppError(403, "REAUTH_REQUIRED", "Please confirm your password to continue."),
  emailNotVerified: () => new AppError(403, "EMAIL_NOT_VERIFIED", "Please verify your email address first."),
  notFound: () => new AppError(404, "NOT_FOUND", "That resource was not found."),
  conflict: (code: string, message: string) => new AppError(409, code, message),
  rateLimited: (retryAfterSec: number) =>
    new AppError(429, "RATE_LIMITED", "Too many attempts. Please wait a moment and try again.", {
      headers: { "Retry-After": String(Math.max(1, Math.ceil(retryAfterSec))) },
    }),
  unsupportedMedia: () => new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json."),
  billingUnavailable: () => new AppError(503, "BILLING_UNAVAILABLE", "Billing is temporarily unavailable. Please try again shortly.", { log: "error" }),
  billingNotConfigured: () => new AppError(503, "BILLING_NOT_CONFIGURED", "Billing is not available yet."),
  unavailable: () => new AppError(503, "SERVICE_UNAVAILABLE", "The service is temporarily unavailable. Please try again shortly.", { log: "error" }),
};
