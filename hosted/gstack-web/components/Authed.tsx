"use client";
import Link from "next/link";
import { SignedIn, SignedOut, SignInButton } from "@/lib/auth";
import { isDevAuth } from "@/lib/auth-mode";

/** Client-side route guard. Renders `children` only when signed in; otherwise
 * a sign-in prompt. We gate in the browser (not the Clerk middleware) because
 * server-side auth.protect() 404s these routes when the __session/__client_uat
 * cookies aren't present — which is the case with the current Clerk setup even
 * for signed-in users. The client session is reliable (same as the dashboard),
 * so this is what actually keeps the tabs working. */
export function Authed({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <div className="max-w-md mx-auto py-24 px-8 text-center anim-fade">
          <h1 className="text-[20px] font-semibold mb-2">Sign in required</h1>
          <p className="text-[13px] text-[var(--color-fg-soft)] mb-5">
            Sign in to view this page.
          </p>
          {isDevAuth() ? (
            <Link href="/" className="btn btn-primary px-5 py-3 text-[13px]">Go to dashboard</Link>
          ) : (
            <SignInButton mode="modal">
              <button className="btn btn-primary px-5 py-3 text-[13px]">Sign in</button>
            </SignInButton>
          )}
        </div>
      </SignedOut>
    </>
  );
}
