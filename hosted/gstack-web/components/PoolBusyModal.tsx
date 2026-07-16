"use client";
import Link from "next/link";

/**
 * Shown when /api/dispatch returns 503 because every brain in the demo
 * pool is currently busy (rare now that the broker queues dispatches).
 * Two outs: try again manually, or bring your own brain.
 *
 * Deliberately NO auto-retry: the old 30s countdown re-POSTed the dispatch
 * forever, so a user who walked away could get specialists dispatched into
 * their meeting minutes later — surprise billing. Retry is explicit now.
 */
export function PoolBusyModal({
  open, onClose, onRetry,
}: {
  open: boolean;
  onClose: () => void;
  /** Called when the user clicks "Try again". */
  onRetry: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 anim-fade"
      style={{ background: "rgba(7, 8, 10, 0.7)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
      role="dialog" aria-modal="true" aria-labelledby="pool-busy-title"
    >
      <div
        className="surface max-w-md w-full p-6 anim-scale"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="dot dot-warn pulse" />
            <span className="badge badge-warn">demo busy</span>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-muted)] hover:text-[var(--color-fg)] text-[20px] leading-none"
            aria-label="Close"
          >×</button>
        </div>

        <h2 id="pool-busy-title" className="text-[20px] font-semibold tracking-tight mb-2">
          Every brain in the demo pool is on a call.
        </h2>
        <p className="text-[13.5px] text-[var(--color-fg-soft)] leading-snug mb-5">
          Each gstack specialist needs a Claude Code "brain" to power it.
          The demo pool runs a handful, and they're all busy right now.
          Try again in a minute — or bring your own brain and skip the line forever.
        </p>

        <div className="flex flex-col gap-2">
          <button className="btn btn-primary" onClick={onRetry}>
            Try again
          </button>
          <Link
            href="/byob"
            className="btn btn-outline"
            onClick={onClose}
          >
            Bring your own brain →
          </Link>
        </div>

        <details className="mt-5 text-[12px] text-[var(--color-muted)]">
          <summary className="cursor-pointer hover:text-[var(--color-fg-soft)]">
            What is a brain?
          </summary>
          <p className="mt-2 leading-snug">
            A "brain" is your coding-agent session (Claude Code, Codex, Cursor, etc.)
            running on a real laptop. When you dispatch a specialist, your brain reads
            the meeting transcript and writes in-character replies that the bot speaks.
            The demo pool runs on the maintainer's laptop; bringing your own brain just
            means running the installer + the daemon — about 60 seconds.
          </p>
        </details>
      </div>
    </div>
  );
}
