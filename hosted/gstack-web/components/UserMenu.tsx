"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * Avatar button that opens a small dropdown (identity + quick links + an
 * explicit Sign out), replacing the old click-to-instantly-sign-out avatar.
 * The caller positions the menu via `menuPosition`: the sidebar pill sits at
 * the bottom-left so it opens upward (`left-0 bottom-full`), the mobile header
 * avatar sits top-right so it opens downward (the default).
 */
export function UserMenu({
  name,
  email,
  image,
  onSignOut,
  menuPosition = "right-0 top-full mt-2",
}: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  onSignOut: () => void;
  menuPosition?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = name || email || "Account";
  const initial = (label.trim()[0] || "?").toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-[var(--color-panel-2)] text-[var(--color-fg-soft)] flex items-center justify-center text-[12px] font-semibold hover:ring-2 hover:ring-[var(--color-accent-ring)] transition"
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" width={28} height={28} className="w-7 h-7 object-cover" />
        ) : (
          initial
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute ${menuPosition} z-50 w-52 bg-[var(--color-panel)] border border-[var(--color-border)] rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.55)] p-1.5 anim-fade`}
        >
          <div className="px-2.5 py-2 mb-1 border-b border-[var(--color-border)]">
            <div className="text-[12.5px] font-medium truncate">{name || "Signed in"}</div>
            {email && <div className="text-[11px] text-[var(--color-muted)] truncate">{email}</div>}
          </div>
          <Link
            href="/byob"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-2.5 py-2 rounded-lg text-[13px] text-[var(--color-fg-soft)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-fg)] transition"
          >
            Your brains
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onSignOut(); }}
            className="w-full text-left px-2.5 py-2 rounded-lg text-[13px] text-[#f87171] hover:bg-[var(--color-panel-2)] transition"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
