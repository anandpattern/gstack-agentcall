/**
 * Server-safe — no "use client" pragma. Checked at both server-render
 * time (layout, middleware) and at client-render time (page bundles).
 */
export function isDevAuth(): boolean {
  // Real Google auth (Auth.js) is on when NEXT_PUBLIC_AUTH_PROVIDER=google
  // (set in prod + preview). Unset (local dev with no Google creds) → the
  // synthetic stub user, so the app still runs locally without auth config.
  return process.env.NEXT_PUBLIC_AUTH_PROVIDER !== "google";
}
