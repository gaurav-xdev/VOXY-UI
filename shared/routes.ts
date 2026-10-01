/**
 * Client-side routes known to the SPA. Shared so the server can answer unknown paths with
 * a real HTTP 404 (still rendering the VOXY 404 page) instead of 200 for everything.
 */
export const CLIENT_ROUTES: readonly string[] = [
  "/",
  "/login",
  "/register",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/account",
  "/terms",
  "/privacy",
  "/refunds",
  "/contact",
  "/privacy-preferences",
];
