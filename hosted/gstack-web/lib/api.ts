"use client";
import { useAuth, useIsSignedIn } from "@/lib/auth";
import useSWR, { type SWRResponse } from "swr";

const perfNow = () => (typeof performance !== "undefined" ? performance.now() : 0);

// Call the broker DIRECTLY when NEXT_PUBLIC_BROKER_URL is set (prod), bypassing
// the Vercel rewrite proxy. That proxy adds ~0.6–1s per call from far regions
// (measured India→prod: ~1s proxied vs ~0.35s direct). Unset (dev / fallback)
// → relative path → the next.config rewrite proxy. SWR keys stay the relative
// path, so caching is unaffected — only the fetch URL changes.
const BROKER_BASE = (process.env.NEXT_PUBLIC_BROKER_URL || "").replace(/\/$/, "");

/** Fetch wrapper that attaches the Clerk session JWT to every request. */
export function useApi() {
  const { getToken } = useAuth();

  async function call<T = unknown>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const t0 = perfNow();
    const token = await getToken();           // Clerk session token (may hit network)
    const tTok = perfNow();
    const headers = new Headers(init.headers as HeadersInit);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    headers.set("X-Client-Token-Ms", String(Math.round(tTok - t0)));  // for broker-side log
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const url = BROKER_BASE && path.startsWith("/") ? BROKER_BASE + path : path;
    const res = await fetch(url, { ...init, headers });
    const tFetch = perfNow();
    const json = await res.json().catch(() => ({}));
    // Perf telemetry — where does a slow request actually spend time?
    //   token = Clerk getToken() (the "session" suspicion)
    //   fetch = network round-trip + broker; Server-Timing app=… is the
    //           broker's own processing, so network ≈ fetch − app.
    // Open devtools console and filter "[perf]".
    if (typeof console !== "undefined") {
      const srv = res.headers.get("Server-Timing") || "";
      console.debug(
        `[perf] ${path} token=${Math.round(tTok - t0)}ms fetch=${Math.round(tFetch - tTok)}ms total=${Math.round(tFetch - t0)}ms${srv ? " " + srv : ""}`,
      );
    }
    if (!res.ok) {
      throw Object.assign(new Error((json as { error?: string }).error || `${res.status}`), { status: res.status, body: json });
    }
    return json as T;
  }

  return call;
}

/**
 * SWR wrapper for authenticated GETs. By default it auto-skips when the
 * user is signed out — the broker would 401 us and pollute logs. Pass
 * `path: null` (standard SWR pattern) to skip for other reasons (e.g.
 * waiting on a prerequisite). Pass `{ allowSignedOut: true }` to force
 * a fetch (e.g. a future public endpoint).
 */
export function useApiSWR<T = unknown>(
  path: string | null,
  opts: { allowSignedOut?: boolean; refreshInterval?: number } = {},
): SWRResponse<T> {
  const call = useApi();
  const signedIn = useIsSignedIn();
  const key = path && (signedIn || opts.allowSignedOut) ? path : null;
  return useSWR<T>(
    key,
    async (p: string) => call<T>(p),
    opts.refreshInterval ? { refreshInterval: opts.refreshInterval } : undefined,
  );
}
