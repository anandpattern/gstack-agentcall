"use client";
import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { isDevAuth } from "@/lib/auth-mode";
import { AgentcallWordmark } from "@/components/AgentcallWordmark";

export default function SignInPage() {
  return (
    <AuthShell>
      {isDevAuth() ? <DevNotice mode="sign-in" /> : <ProviderSignIn label="Sign in" />}
    </AuthShell>
  );
}

function ProviderSignIn({ label }: { label: string }) {
  return (
    <div className="card text-center p-8">
      <h2 className="text-[16px] font-semibold mb-1">{label} to gstack</h2>
      <p className="text-[12.5px] text-[var(--color-fg-soft)] mb-6">Continue with Google or GitHub.</p>
      <div className="space-y-2.5">
        <button
          onClick={() => signIn("google", { callbackUrl: "/" })}
          className="btn btn-primary w-full inline-flex items-center justify-center gap-2.5"
        >
          <GoogleGlyph /> Continue with Google
        </button>
        <button
          onClick={() => signIn("github", { callbackUrl: "/" })}
          className="btn btn-outline w-full inline-flex items-center justify-center gap-2.5"
        >
          <GitHubGlyph /> Continue with GitHub
        </button>
      </div>

      <div className="flex items-center gap-3 my-5">
        <div className="h-px flex-1 bg-[var(--color-border)]" />
        <span className="text-[11px] text-[var(--color-muted)]">or</span>
        <div className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      <MagicLinkForm />
    </div>
  );
}

function MagicLinkForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setState("sending"); setMsg("");
    try {
      const r = await fetch("/api/magic/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setState("error"); setMsg(data?.error || "Couldn't send the link."); return; }
      setState("sent");
    } catch {
      setState("error"); setMsg("Network error — try again.");
    }
  }

  if (state === "sent") {
    return (
      <div className="text-center anim-fade">
        <div className="text-[13.5px] font-medium mb-1">Check your email</div>
        <p className="text-[12px] text-[var(--color-fg-soft)]">
          We sent a sign-in link to <span className="text-[var(--color-fg)]">{email}</span>. It expires in 15 minutes.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={send} className="space-y-2.5 text-left">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        className="w-full"
        autoComplete="email"
      />
      <button type="submit" disabled={state === "sending"} className="btn btn-outline w-full">
        {state === "sending" ? "Sending…" : "Email me a magic link"}
      </button>
      {state === "error" && <p className="text-[11.5px] text-[#f87171] text-center">{msg}</p>}
    </form>
  );
}

function GitHubGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.6 7.6 0 0 1 8 4.84c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
    </svg>
  );
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.71H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.98 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3.02-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.02 2.34C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-8 anim-fade">
      <div className="max-w-md w-full">
        <Link href="/" className="flex items-center gap-2.5 mb-8 justify-center">
          <span className="text-[18px] font-semibold tracking-tight text-[var(--color-accent)]">gstack</span>
          <span className="text-[17px] font-light leading-none" style={{ color: "#5c6052" }}>/</span>
          <AgentcallWordmark height={20} className="text-[#f4eedd]" />
        </Link>
        {children}
      </div>
    </div>
  );
}

function DevNotice({ mode }: { mode: "sign-in" | "sign-up" }) {
  return (
    <div className="card text-center p-8">
      <div className="text-[32px] mb-3 opacity-40">⚡</div>
      <h2 className="text-[16px] font-semibold mb-2">Dev mode — no {mode} required</h2>
      <p className="text-[12.5px] text-[var(--color-fg-soft)] mb-5">
        Running with a synthetic dev user (auto-promoted to admin) because Google auth
        isn't configured here. To enable real sign-in, set
        <code className="mono mx-1">NEXT_PUBLIC_AUTH_PROVIDER=google</code> plus the
        <code className="mono mx-1">AUTH_GOOGLE_ID</code>/<code className="mono">AUTH_GOOGLE_SECRET</code> env vars.
      </p>
      <Link href="/" className="btn btn-primary inline-flex">Enter dashboard</Link>
    </div>
  );
}
