import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { SignJWT, jwtVerify } from "jose";

/**
 * Auth.js (v5) — Google + GitHub sign-in, replacing Clerk.
 *
 * The session carries a short-lived HS256 "broker token" signed with
 * AUTH_BROKER_SECRET (shared with the broker). The client sends it as the
 * Bearer on every /api/* call; the broker validates it in verify_broker_jwt
 * (hosted/broker/auth.py) and maps {sub, email, name} to the user. Admin is
 * still assigned by GSTACK_ADMIN_EMAILS on the broker, so the operator stays
 * admin under whichever provider carries their admin email (Google has it
 * reliably; GitHub only if the primary email is public/verified).
 *
 * The jwt/session callbacks are provider-agnostic: Auth.js pre-populates
 * token.sub with the provider's user id (Google sub / GitHub id), and the
 * email/name reads below fall back to those defaults when a provider's raw
 * profile omits them.
 *
 * Env: AUTH_SECRET (session encryption), AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET,
 * AUTH_GITHUB_ID + AUTH_GITHUB_SECRET (each read automatically by its
 * provider), AUTH_BROKER_SECRET (shared with the broker).
 */
const BROKER_SECRET = process.env.AUTH_BROKER_SECRET || "";
// Magic-link tokens are signed/verified with AUTH_SECRET (already set). The
// link IS the proof — a short-lived signed JWT carrying the email — so no
// database / verification-token store is required.
const MAGIC_SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || "");

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [
    Google,
    GitHub,
    // Email magic-link: the user clicks a signed, 15-min link; the /magic page
    // calls signIn("magic", { token }) and we verify the JWT here. Stateless —
    // the signature is the verification, so no adapter/DB is required.
    Credentials({
      id: "magic",
      name: "Email magic link",
      credentials: { token: {} },
      async authorize(creds) {
        const token = typeof creds?.token === "string" ? creds.token : "";
        if (!token) return null;
        try {
          const { payload } = await jwtVerify(token, MAGIC_SECRET);
          if (payload.purpose !== "magic" || !payload.email) return null;
          const email = String(payload.email).toLowerCase();
          return { id: `email:${email}`, email, name: email.split("@")[0] };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, profile }) {
      if (profile) {
        token.sub = (profile.sub as string) || token.sub;
        token.email = (profile.email as string | undefined) ?? token.email;
        token.name = (profile.name as string | undefined) ?? token.name;
      } else if (user) {
        // Magic-link (Credentials): identity comes from authorize()'s return.
        token.sub = (user.id as string) || token.sub;
        token.email = user.email ?? token.email;
        token.name = user.name ?? token.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      if (BROKER_SECRET && token.sub) {
        const key = new TextEncoder().encode(BROKER_SECRET);
        session.brokerToken = await new SignJWT({ email: token.email, name: token.name })
          .setProtectedHeader({ alg: "HS256" })
          .setSubject(token.sub)
          .setIssuedAt()
          .setExpirationTime("1h")
          .sign(key);
      }
      return session;
    },
  },
});
