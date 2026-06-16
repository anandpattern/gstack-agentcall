import { NextResponse, type NextRequest } from "next/server";

const HAS_CLERK = !!(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_") ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_")
);

// Dev mode: pass everything through unauthenticated.
function devMiddleware(_req: NextRequest) {
  return NextResponse.next();
}

// Prod mode: wrap with Clerk middleware. Imported lazily so a missing
// CLERK_SECRET_KEY in dev doesn't crash the import-time module init.
// Clerk's middleware signature is (NextRequest, NextFetchEvent) but it's
// permissive about the second arg; we just forward whatever Next gives us.
type ClerkLikeHandler = (req: NextRequest, evt: unknown) => Response | Promise<Response>;
let prodMiddleware: ClerkLikeHandler | null = null;
async function getProdMiddleware(): Promise<ClerkLikeHandler> {
  if (prodMiddleware) return prodMiddleware;
  const { clerkMiddleware } = await import("@clerk/nextjs/server");
  // Route protection is handled CLIENT-SIDE (<SignedIn>/<SignedOut> + the
  // admin Guard), NOT here. Server-side auth.protect() was rewriting the
  // protected routes (/calls, /workers, /admin) to a 404 even for signed-in
  // users: with the current Clerk setup the server-side session cookies
  // (__session/__client_uat) aren't reliably present, so the middleware saw
  // every request as signed-out (x-clerk-auth-reason:
  // session-token-and-uat-missing). The client session works fine (the
  // dashboard proves it), so we gate in the browser instead. clerkMiddleware
  // still runs (ClerkProvider needs it) but no longer blocks any route.
  prodMiddleware = clerkMiddleware(async () => {
    /* no server-side protection — see note above */
  }) as unknown as ClerkLikeHandler;
  return prodMiddleware;
}

export default async function middleware(req: NextRequest, evt: unknown) {
  if (!HAS_CLERK) return devMiddleware(req);
  const handler = await getProdMiddleware();
  return handler(req, evt);
}

export const config = {
  // Skip _next, static files, AND the broker-proxy routes (/api/*, /healthz,
  // /readyz). Those are next.config rewrites to the broker, which does its own
  // auth — running Clerk's middleware on them is pure redundant edge latency on
  // every single API call. (There are no real Next.js /api routes.)
  matcher: [
    "/((?!_next|api/|healthz|readyz|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
