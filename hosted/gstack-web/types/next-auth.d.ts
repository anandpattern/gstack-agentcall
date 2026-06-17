import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    /** Short-lived HS256 token the broker validates (verify_broker_jwt). */
    brokerToken?: string;
    user?: { id?: string } & DefaultSession["user"];
  }
}
