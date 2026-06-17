import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy /api/* to the broker (dev/preview fallback; in prod the client calls
  // the broker directly via NEXT_PUBLIC_BROKER_URL). These live in `fallback`
  // so they run AFTER Next's own routes — which means Auth.js's
  // /api/auth/[...nextauth] handler is matched first and never proxied, while
  // every other /api/* (no Next route) falls through to the broker.
  async rewrites() {
    const broker = process.env.GSTACK_BROKER_URL || "http://127.0.0.1:8787";
    return {
      fallback: [
        { source: "/api/:path*", destination: `${broker}/api/:path*` },
        { source: "/healthz",    destination: `${broker}/healthz` },
        { source: "/readyz",     destination: `${broker}/readyz`  },
      ],
    };
  },
};

export default nextConfig;
