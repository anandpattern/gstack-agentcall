/**
 * Unified auth surface — switches between real Clerk and the dev stub at
 * import time based on the publishable-key env var. Pages import from here
 * instead of @clerk/nextjs so a missing/placeholder key turns the whole
 * app into dev-mode without conditional logic in each component.
 */
import * as Stub from "./auth-stub";
import { isDevAuth as _isDevAuth } from "./auth-mode";
import {
  ClerkProvider as ClerkProviderReal,
  SignInButton as SignInButtonReal,
  SignedIn as SignedInReal,
  SignedOut as SignedOutReal,
  UserButton as UserButtonReal,
} from "@clerk/nextjs";
import { useAuth as useAuthReal, useUser as useUserReal } from "@clerk/nextjs";

const DEV = _isDevAuth();

export const Provider = DEV ? Stub.StubProvider : ClerkProviderReal;
export const SignedIn = DEV ? Stub.StubSignedIn : SignedInReal;
export const SignedOut = DEV ? Stub.StubSignedOut : SignedOutReal;
export const SignInButton = DEV ? Stub.StubSignInButton : SignInButtonReal;
export const UserButton = DEV ? Stub.StubUserButton : UserButtonReal;
export const useAuth: () => { getToken: () => Promise<string | null> } =
  DEV ? Stub.useStubAuth : (useAuthReal as unknown as () => { getToken: () => Promise<string | null> });

/** Returns true once the auth provider has confirmed a session. In dev
 * mode it returns true immediately (synthetic user). In Clerk mode it
 * returns false until Clerk has loaded AND a user is present — so SWR
 * keys can short-circuit and we never hit the broker unauthenticated. */
export const useIsSignedIn: () => boolean = DEV
  ? Stub.useStubIsSignedIn
  : () => {
      const { isLoaded, isSignedIn } = useUserReal();
      return !!(isLoaded && isSignedIn);
    };

/** Like useIsSignedIn but ALSO reports whether the auth provider has finished
 * loading (`ready`). Data hooks use this to show a loading state while Clerk
 * is still initializing instead of a misleading empty state — a slow Clerk
 * init otherwise looks like "nothing loads". In dev (stub), auth is instant. */
export const useAuthGate: () => { ready: boolean; signedIn: boolean } = DEV
  ? () => ({ ready: true, signedIn: Stub.useStubIsSignedIn() })
  : () => {
      const { isLoaded, isSignedIn } = useUserReal();
      return { ready: isLoaded, signedIn: !!(isLoaded && isSignedIn) };
    };

export const isDevAuth = DEV;
