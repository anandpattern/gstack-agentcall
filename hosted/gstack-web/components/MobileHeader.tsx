"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@/lib/auth";
import { useApiSWR } from "@/lib/api";
import { useSticky } from "@/lib/useSticky";
import type { User } from "@/lib/types";
import { AgentcallWordmark } from "@/components/AgentcallWordmark";

/**
 * Mobile-only top bar. Replaces the desktop sidebar below md (768px).
 * Brand on the left, status dot + auth controls + hamburger on the right.
 * Hamburger opens a slide-down nav with the same routes admins/members see
 * in the desktop sidebar.
 */
export function MobileHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { data: meResp } = useApiSWR<{ user: User }>("/api/me");
  const isAdmin = meResp?.user?.role === "admin";

  const memberNav = [
    { href: "/",            label: "Dashboard"        },
    { href: "/byob",        label: "Bring your brain" },
  ];
  const adminNav = [
    { href: "/calls",   label: "Calls" },
    { href: "/workers", label: "Brains" },
    { href: "/admin",   label: "Admin" },
  ];

  return (
    <>
      <header className="md:hidden sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-bg)]/90 backdrop-blur-md">
        <div className="px-4 h-14 flex items-center gap-2.5">
          <Link href="/" className="flex items-center gap-1.5 min-w-0" onClick={() => setOpen(false)}>
            <span className="font-semibold text-[15px] tracking-tight text-[var(--color-accent)] shrink-0">gstack</span>
            <span className="text-[14px] font-light leading-none shrink-0" style={{ color: "#5c6052" }}>/</span>
            <AgentcallWordmark height={16} className="text-[#f4eedd] shrink-0" />
          </Link>
          <MobileStatus />
          <div className="ml-auto flex items-center gap-2">
            <SignedIn>
              <UserButton />
              <button
                onClick={() => setOpen((v) => !v)}
                className="w-9 h-9 rounded-lg border border-[var(--color-border)] flex items-center justify-center"
                aria-label="Menu" aria-expanded={open}
              >
                <Hamburger open={open} />
              </button>
            </SignedIn>
            <SignedOut>
              <SignInButton mode="modal">
                <button className="btn btn-primary text-[12px] py-1.5 px-3">Sign in</button>
              </SignInButton>
            </SignedOut>
          </div>
        </div>
      </header>

      {/* slide-down nav */}
      <SignedIn>
        {open && (
          <div
            className="md:hidden fixed inset-0 z-40 anim-fade"
            style={{ background: "rgba(7, 8, 10, 0.5)", backdropFilter: "blur(4px)" }}
            onClick={() => setOpen(false)}
          >
            <div
              className="bg-[var(--color-bg)] border-b border-[var(--color-border)] px-4 py-3 anim-up"
              style={{ marginTop: 56 }}
              onClick={(e) => e.stopPropagation()}
            >
              <nav className="space-y-1">
                {memberNav.map((n) => (
                  <MobileNavLink key={n.href} {...n} active={pathname === n.href || (n.href !== "/" && pathname.startsWith(n.href))} onClick={() => setOpen(false)} />
                ))}
                {isAdmin && (
                  <>
                    <div className="label-cap px-3 pt-3 pb-1">Admin</div>
                    {adminNav.map((n) => (
                      <MobileNavLink key={n.href} {...n} active={pathname.startsWith(n.href)} onClick={() => setOpen(false)} />
                    ))}
                  </>
                )}
                <a
                  href="https://github.com/pattern-ai-labs/gstack-joins-meeting"
                  target="_blank" rel="noopener noreferrer"
                  className="block px-3 py-2.5 mt-3 surface text-[13px]"
                  onClick={() => setOpen(false)}
                >
                  ⌥ Run gstack locally
                  <div className="text-[10px] text-[var(--color-muted)] mt-0.5">inspired by @garrytan · MIT</div>
                </a>
              </nav>
            </div>
          </div>
        )}
      </SignedIn>
    </>
  );
}

function MobileNavLink({ href, label, active, onClick }:
  { href: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`block px-3 py-2.5 rounded-lg text-[14px] ${
        active
          ? "bg-[var(--color-panel)] text-[var(--color-fg)]"
          : "text-[var(--color-fg-soft)]"
      }`}
    >
      {label}
    </Link>
  );
}

function MobileStatus() {
  const { data, error } = useApiSWR<{ ok: boolean; brains?: number; brains_total?: number }>(
    "/healthz", { refreshInterval: 10000, allowSignedOut: true });
  const up = !error && data?.ok === true;
  const live = useSticky(up && (data?.brains ?? 0) > 0);  // sticky so it doesn't flap on a missed poll
  const busy = up && !live && (data?.brains_total ?? 0) > 0;
  return (
    <span
      className={`dot ${live ? "dot-ok pulse" : up ? "dot-mute" : error ? "dot-bad" : "dot-mute"}`}
      title={live ? "Demo live — a brain is ready" : up ? (busy ? "Pool busy — dispatches will queue" : "Pool offline") : "Demo offline"}
    />
  );
}

function Hamburger({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      {open
        ? (<><path d="M6 6l12 12"/><path d="M18 6l-12 12"/></>)
        : (<><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></>)}
    </svg>
  );
}
