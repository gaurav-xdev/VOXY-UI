import type { Mail } from "./mailer";

// Plain-text only: no HTML means no HTML-injection surface in transactional email.
// Tokens travel in the URL fragment so they never reach server logs or Referer headers.

export const verifyEmail = (to: string, url: string): Mail => ({
  to,
  subject: "Confirm your VOXY email address",
  text: `Confirm your email address to finish setting up your VOXY account:\n\n${url}\n\nThis link expires in 24 hours and can be used once. If you didn't create an account, you can ignore this email.`,
});

export const accountExistsNotice = (to: string, signInUrl: string, resetUrl: string): Mail => ({
  to,
  subject: "VOXY sign-up attempt",
  text: `Someone tried to create a VOXY account with this email address, but one already exists.\n\nIf it was you, sign in here: ${signInUrl}\nForgot your password? ${resetUrl}\n\nIf it wasn't you, no action is needed.`,
});

export const passwordReset = (to: string, url: string): Mail => ({
  to,
  subject: "Reset your VOXY password",
  text: `We received a request to reset your VOXY password:\n\n${url}\n\nThis link expires in 1 hour and can be used once. If you didn't ask for this, you can ignore this email — your password has not changed.`,
});

export const passwordChanged = (to: string): Mail => ({
  to,
  subject: "Your VOXY password was changed",
  text: "Your VOXY password was just changed and all other sessions were signed out. If this wasn't you, reset your password immediately and contact support.",
});

export const paymentFailed = (to: string, accountUrl: string): Mail => ({
  to,
  subject: "VOXY payment failed",
  text: `We couldn't process your latest VOXY subscription payment. Please update your payment method to keep your access:\n\n${accountUrl}`,
});
