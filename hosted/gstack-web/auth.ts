import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { SignJWT } from "jose";

/**
 * Auth.js (v5) — Google sign-in, replacing Clerk.
 *
 * The session carries a short-lived HS256 "broker token" signed with
 * AUTH_BROKER_SECRET (shared with the broker). The client sends it as the
 * Bearer on every /api/* call; the broker validates it in verify_broker_jwt
 * (hosted/broker/auth.py) and maps {sub, email, name} to the user. Admin is
 * still assigned by GSTACK_ADMIN_EMAILS on the broker, so the operator stays
 * admin under their Google account.
 *
 * Env: AUTH_SECRET (session encryption), AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET
 * (read automatically by the Google provider), AUTH_BROKER_SECRET (shared).
 */
const BROKER_SECRET = process.env.AUTH_BROKER_SECRET || "";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [Google],
  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        token.sub = (profile.sub as string) || token.sub;
        token.email = (profile.email as string | undefined) ?? token.email;
        token.name = (profile.name as string | undefined) ?? token.name;
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
