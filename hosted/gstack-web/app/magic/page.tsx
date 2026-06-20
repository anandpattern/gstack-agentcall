"use client";
import { Suspense, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

/**
 * Magic-link landing page. Reads ?token from the emailed link and redeems it
 * through the Auth.js "magic" Credentials provider, which verifies the signed
 * JWT (auth.ts) and creates the session, then redirects to the dashboard.
 */
function MagicInner() {
  const params = useSearchParams();
  const token = params.get("token");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token) { setFailed(true); return; }
    signIn("magic", { token, callbackUrl: "/", redirect: true }).catch(() => setFailed(true));
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center p-8 text-center">
      {failed ? (
        <div className="max-w-sm">
          <div className="text-[15px] font-semibold mb-1">This link didn’t work</div>
          <p className="text-[13px] text-[var(--color-fg-soft)] mb-5">
            It may have expired (links last 15 minutes) or already been used. Request a new one.
          </p>
          <Link href="/sign-in" className="btn btn-primary">Back to sign in</Link>
        </div>
      ) : (
        <div className="text-[14px] text-[var(--color-fg-soft)] anim-fade">Signing you in…</div>
      )}
    </div>
  );
}

export default function MagicPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-[14px] text-[var(--color-fg-soft)]">Signing you in…</div>}>
      <MagicInner />
    </Suspense>
  );
}
