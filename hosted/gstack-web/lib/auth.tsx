/**
 * Unified auth surface — Auth.js (Google) in prod/preview, the dev stub
 * locally. Pages import these instead of next-auth/react directly, so the
 * provider can be swapped (or run as the synthetic stub) with no per-component
 * changes. The exported API is identical to the previous Clerk version, so all
 * consumers (Sidebar, dashboard, api.ts, admin, byob, …) work unchanged.
 */
"use client";
import * as Stub from "./auth-stub";
import { isDevAuth as _isDevAuth } from "./auth-mode";
import { SessionProvider, useSession, signIn, signOut } from "next-auth/react";

const DEV = _isDevAuth();

function RealProvider({ children }: { children: React.ReactNode }) {
  // Refetch every 50 min so the session callback re-mints the 1h broker token
  // before it expires (also refetches on window focus by default).
  return (
    <SessionProvider refetchInterval={50 * 60} refetchOnWindowFocus>
      {children}
    </SessionProvider>
  );
}
export const Provider = DEV ? Stub.StubProvider : RealProvider;

function RealSignedIn({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  return status === "authenticated" ? <>{children}</> : null;
}
function RealSignedOut({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  return status === "unauthenticated" ? <>{children}</> : null;
}
export const SignedIn = DEV ? Stub.StubSignedIn : RealSignedIn;
export const SignedOut = DEV ? Stub.StubSignedOut : RealSignedOut;

function RealSignInButton({ children }: { mode?: string; children: React.ReactNode }) {
  // Google redirect sign-in. `mode` (Clerk's modal) is ignored — Google has no
  // modal flow. display:contents so the wrapper doesn't alter the child layout.
  return (
    <span style={{ display: "contents" }} onClick={() => signIn("google")}>
      {children}
    </span>
  );
}
export const SignInButton = DEV ? Stub.StubSignInButton : RealSignInButton;

function RealUserButton() {
  const { data } = useSession();
  const u = data?.user;
  const label = u?.name || u?.email || "Account";
  const initial = (label.trim()[0] || "?").toUpperCase();
  const avatar = u?.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={u.image} alt="" width={28} height={28} className="w-7 h-7 object-cover" />
  ) : (
    initial
  );
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      title={`${label} — click to sign out`}
      aria-label="Sign out"
      className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-[var(--color-panel-2)] text-[var(--color-fg-soft)] flex items-center justify-center text-[12px] font-semibold hover:ring-2 hover:ring-[var(--color-accent-ring)] transition"
    >
      {avatar}
    </button>
  );
}
export const UserButton = DEV ? Stub.StubUserButton : RealUserButton;

export const useAuth: () => { getToken: () => Promise<string | null> } = DEV
  ? Stub.useStubAuth
  : () => {
      const { data } = useSession();
      return { getToken: async () => data?.brokerToken ?? null };
    };

/** True once auth has confirmed a signed-in session. */
export const useIsSignedIn: () => boolean = DEV
  ? Stub.useStubIsSignedIn
  : () => useSession().status === "authenticated";

/** Like useIsSignedIn but ALSO reports whether auth finished loading
 * (`ready`). Data hooks use this to show a loading state while the session
 * resolves instead of a misleading empty state. In dev (stub) it's instant. */
export const useAuthGate: () => { ready: boolean; signedIn: boolean } = DEV
  ? () => ({ ready: true, signedIn: Stub.useStubIsSignedIn() })
  : () => {
      const { status } = useSession();
      return { ready: status !== "loading", signedIn: status === "authenticated" };
    };

export const isDevAuth = DEV;
