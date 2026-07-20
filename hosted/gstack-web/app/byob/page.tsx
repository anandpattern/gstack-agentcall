"use client";
import { useState } from "react";
import Link from "next/link";
import { SignedIn, SignedOut, SignInButton } from "@/lib/auth";
import { useApi, useApiSWR } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { brainInstallCommand } from "@/lib/brain-install";
import { useMintedBrainLive } from "@/lib/useBrainLive";
import type { Worker, WorkerKey } from "@/lib/types";

/**
 * Bring Your Own Brain — visitor signs in, mints a brain key, runs the
 * install one-liner on their laptop, and dispatches against THEIR OWN
 * brain instead of the shared demo pool.
 *
 * Phase C: explainer copy + the create-brain CTA + the install snippet.
 * The actual "is my brain online?" pill polls /api/workers and looks for
 * any worker owned by the current user.
 */
export default function ByobPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-10 anim-fade">
      <Link href="/" className="text-[12px] text-[var(--color-muted)] hover:text-[var(--color-fg)]">← back to dashboard</Link>

      <header className="mt-4 mb-8">
        <h1 className="text-[24px] sm:text-[32px] font-semibold tracking-tight">Bring your own brain</h1>
        <p className="text-[14px] text-[var(--color-fg-soft)] mt-2 leading-relaxed max-w-2xl">
          Skip the shared demo pool. Run your own brain on your own laptop —
          dispatches route to it first, you never wait in line.
        </p>
      </header>

      <Explainer />

      <SignedOut>
        <div className="card text-center mt-8 py-8">
          <p className="text-[13px] text-[var(--color-fg-soft)] mb-4">Sign in to create your brain.</p>
          <SignInButton mode="modal">
            <button className="btn btn-primary">Sign in</button>
          </SignInButton>
        </div>
      </SignedOut>

      <SignedIn>
        <Creator />
        <YourBrains />
      </SignedIn>
    </div>
  );
}

function Explainer() {
  return (
    <section className="space-y-3 card mb-6">
      <h2 className="font-semibold text-[15px]">What is a brain?</h2>
      <ul className="text-[13.5px] text-[var(--color-fg-soft)] space-y-2 list-disc list-inside leading-relaxed">
        <li>
          A brain is a <strong className="text-[var(--color-fg)]">coding agent session running on your laptop</strong>
          — <span className="mono text-[12px]">Claude Code</span>, <span className="mono text-[12px]">Codex</span>,
          <span className="mono text-[12px]"> Cursor</span>, or any agent that can spawn a subprocess and read stdout.
          When a bot in your meeting needs to reply, your brain reads the transcript and writes the reply
          in-character.
        </li>
        <li>
          The brain only sees what <strong className="text-[var(--color-fg)]">you</strong> dispatch through it.
          It cannot access your files, accounts, or anything outside this demo session.
        </li>
        <li>
          When you close it, it stops. Nothing persists on our servers
          besides the dispatch history shown in your dashboard.
        </li>
        <li>
          Setup takes about 60 seconds: one curl, one paste, one command.
        </li>
      </ul>
    </section>
  );
}

function Creator() {
  const call = useApi();
  const toast = useToast();
  const [label, setLabel] = useState("my-laptop");
  const [pending, setPending] = useState(false);
  const [key, setKey] = useState<string | null>(null);

  async function mint() {
    setPending(true);
    try {
      const r = await call<{ worker_key: string }>("/api/worker-keys", {
        method: "POST", body: JSON.stringify({ label: label.trim() || "my-laptop" }),
      });
      setKey(r.worker_key);
      toast.push({ kind: "ok", title: "Brain created", body: "Copy the install command below." });
    } catch (e) {
      toast.push({ kind: "err", title: "Couldn't create brain", body: (e as Error).message });
    } finally {
      setPending(false);
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.push({ kind: "ok", title: `${label} copied` });
    } catch {
      toast.push({ kind: "err", title: `Couldn't copy ${label.toLowerCase()}` });
    }
  }

  const install = key ? brainInstallCommand(key) : null;

  return (
    <section className="space-y-6">
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-9 h-9 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)] flex items-center justify-center text-[14px] font-bold">1</span>
          <div>
            <div className="font-semibold text-[15px]">Create a brain</div>
            <div className="text-[12px] text-[var(--color-muted)]">Give it a label so you remember which machine it's on.</div>
          </div>
        </div>

        {!key ? (
          <div className="flex gap-2 max-w-md">
            <input
              value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder="my-laptop"
              className="flex-1"
            />
            <button className="btn btn-primary" disabled={pending} onClick={mint}>
              {pending ? "Creating…" : "Create brain"}
            </button>
          </div>
        ) : (
          <div className="surface p-4 bg-[var(--color-bg-soft)]">
            <div className="label-cap mb-2">Your brain key (shown once)</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 mono text-[12.5px] break-all text-[var(--color-accent)]">{key}</code>
              <button className="btn btn-outline text-[11px] py-1.5 px-2.5 shrink-0" onClick={() => copy(key, "Key")}>Copy</button>
            </div>
          </div>
        )}
      </div>

      {install && (
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-9 h-9 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)] flex items-center justify-center text-[14px] font-bold">2</span>
            <div className="flex-1">
              <div className="font-semibold text-[15px]">Run this on your laptop</div>
              <div className="text-[12px] text-[var(--color-muted)]">
                Clones our <a className="underline" href="https://github.com/pattern-ai-labs/gstack-joins-meeting/blob/main/hosted/worker.py" target="_blank" rel="noopener">open-source worker</a>, installs its deps (<span className="mono">aiohttp, websockets</span>), and starts the brain pointed at our broker.
                No <span className="mono">curl | bash</span> — read every line first if you like. Runs entirely on your machine; the key only lets it join meetings you dispatch and is revocable here anytime.
              </div>
            </div>
            <button className="btn btn-primary text-[12px]" onClick={() => copy(install, "Command")}>Copy</button>
          </div>
          <pre className="surface p-4 bg-[var(--color-bg-soft)] text-[11.5px] mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">
{install}
          </pre>
          <p className="text-[11.5px] text-[var(--color-muted)] mt-3 leading-snug">
            Make sure your coding agent of choice (
            <a className="underline" href="https://claude.com/claude-code" target="_blank" rel="noopener">Claude Code</a>,
            <a className="underline ml-1" href="https://github.com/openai/codex" target="_blank" rel="noopener">Codex</a>,
            <a className="underline ml-1" href="https://cursor.com" target="_blank" rel="noopener">Cursor</a>)
            is installed and signed in. The session running in that terminal becomes the brain.
          </p>
        </div>
      )}

      {install && <WaitForGreen />}
    </section>
  );
}

/* Step 3 — honest connection status. Grey while the freshly-minted brain
 * hasn't connected, green + relabeled the moment it does (5s poll). Was a
 * hardcoded blinking orange dot that never changed (live-test feedback). */
function WaitForGreen() {
  const { live, otherOnline } = useMintedBrainLive(true);
  return (
    <div className="card flex items-center gap-3">
      <span className="w-9 h-9 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)] flex items-center justify-center text-[14px] font-bold shrink-0">3</span>
      <div className="flex-1">
        <div className="font-semibold text-[14px]">{live ? "Your brain is live" : "Wait for the green dot"}</div>
        <div className="text-[12px] text-[var(--color-muted)]">
          {live
            ? "Connected — dispatches from your account route to it first."
            : "Grey until your brain connects — this flips green automatically (checks every 5 seconds)."}
          {!live && otherOnline && (
            <span className="block mt-0.5 opacity-80">
              (Another of your brains is already online — this dot tracks the new key only.)
            </span>
          )}
        </div>
      </div>
      <span className={`dot ${live ? "dot-ok pulse" : "dot-mute"}`} />
      <Link href="/" className="btn btn-outline text-[12px]">Dashboard</Link>
    </div>
  );
}

/**
 * Lets a member see and control the brains they've created — live/offline
 * status (polled) and a Stop button that revokes the key and disconnects the
 * brain. Renders nothing until they've made at least one (the Creator above
 * covers the empty state).
 */
function YourBrains() {
  const call = useApi();
  const toast = useToast();
  const { data: keysResp, isLoading, mutate: refreshKeys } =
    useApiSWR<{ keys: WorkerKey[] }>("/api/worker-keys");
  const { data: workersResp, mutate: refreshWorkers } =
    useApiSWR<{ workers: Worker[] }>("/api/workers", { refreshInterval: 5000 });

  const keys = keysResp?.keys ?? [];
  const workers = workersResp?.workers ?? [];

  async function stop(prefix: string, label: string) {
    if (!confirm(`Stop "${label}"? The brain on that machine is disconnected and can't reconnect with this key.`)) return;
    try {
      await call("/api/worker-keys/revoke", {
        method: "POST",
        body: JSON.stringify({ key_hash: prefix.replace("…", "") }),
      });
      toast.push({ kind: "ok", title: "Brain stopped", body: `"${label}" disconnected` });
      refreshKeys(); refreshWorkers();
    } catch (e) {
      toast.push({ kind: "err", title: "Couldn't stop brain", body: (e as Error).message });
    }
  }

  if (isLoading && !keysResp) return null;
  if (keys.length === 0) return null;

  const active = keys.filter((k) => !k.revoked).length;
  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[15px] font-semibold">Your brains</h2>
        <span className="text-[12px] text-[var(--color-muted)]">{active} active</span>
      </div>
      <div className="space-y-2">
        {keys.map((k) => {
          const online = !k.revoked && workers.some((w) => w.key_prefix === k.key_hash_prefix);
          return (
            <div key={k.key_hash_prefix} className="card flex items-center gap-3">
              <span className={`dot shrink-0 ${k.revoked ? "dot-bad" : online ? "dot-ok pulse" : "dot-mute"}`} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-[13.5px] truncate">{k.label}</div>
                <div className="text-[11px] text-[var(--color-muted)]">
                  {k.revoked ? "revoked" : online ? "live — connected" : "offline — not running"}
                </div>
              </div>
              {k.revoked ? (
                <span className="badge badge-bad shrink-0">revoked</span>
              ) : (
                <button
                  className="btn btn-danger text-[11px] py-1.5 px-2.5 shrink-0"
                  onClick={() => stop(k.key_hash_prefix, k.label)}
                >
                  Stop
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-[var(--color-muted)] mt-2 leading-snug">
        “Stop” revokes the key and disconnects the brain. To pause it without revoking, just quit the agent session in your laptop’s terminal.
      </p>
    </section>
  );
}
