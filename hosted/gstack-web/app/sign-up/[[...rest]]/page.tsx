"use client";
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { isDevAuth } from "@/lib/auth-mode";
import { AgentcallWordmark } from "@/components/AgentcallWordmark";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8 anim-fade">
      <div className="max-w-md w-full">
        <Link href="/" className="flex items-center gap-2.5 mb-8 justify-center">
          <span className="text-[18px] font-semibold tracking-tight text-[var(--color-accent)]">gstack</span>
          <span className="text-[17px] font-light leading-none" style={{ color: "#5c6052" }}>/</span>
          <AgentcallWordmark height={20} className="text-[#f4eedd]" />
        </Link>
        {isDevAuth() ? (
          <div className="card text-center p-8">
            <div className="text-[32px] mb-3 opacity-40">⚡</div>
            <h2 className="text-[16px] font-semibold mb-2">Dev mode — no sign-up required</h2>
            <p className="text-[12.5px] text-[var(--color-fg-soft)] mb-5">
              You're already signed in as the synthetic dev user. To enable real auth,
              set <code className="mono">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> in <code className="mono">.env.local</code>.
            </p>
            <Link href="/" className="btn btn-primary inline-flex">Enter dashboard</Link>
          </div>
        ) : (
          <SignUp appearance={{ variables: { colorPrimary: "#b9f450" } }} />
        )}
      </div>
    </div>
  );
}
