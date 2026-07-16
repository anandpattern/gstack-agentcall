"use client";
import { useState } from "react";
import { useApi, useApiSWR } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { brainInstallCommand } from "@/lib/brain-install";
import { useMintedBrainLive } from "@/lib/useBrainLive";
import type { User } from "@/lib/types";

/**
 * Shown on the dashboard when the user has 0 online brains.
 * Walks them through: create a brain → copy the install one-liner → wait for green.
 */
export function OnboardingFlow({ onMinted }: { onMinted: () => void }) {
  const call = useApi();
  const toast = useToast();
  const { data: meResp } = useApiSWR<{ user: User }>("/api/me");
  // Pre-fill a personal, distinct brain name from the signed-in user, so two
  // people don't both end up with "my-laptop". The field stays editable —
  // until the user types, we show the suggestion; after, their value wins.
  const suggested = (() => {
    const u = meResp?.user;
    const base = (u?.display_name?.trim().split(/\s+/)[0] || u?.email?.split("@")[0] || "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return base ? `${base}-laptop` : "my-laptop";
  })();
  const [label, setLabel] = useState<string | null>(null);
  const labelValue = label ?? suggested;
  const [pending, setPending] = useState(false);
  const [key, setKey] = useState<string | null>(null);

  async function mint() {
    setPending(true);
    try {
      const r = await call<{ worker_key: string }>("/api/worker-keys", {
        method: "POST", body: JSON.stringify({ label: labelValue.trim() || "my-laptop" }),
      });
      setKey(r.worker_key);
      toast.push({ kind: "ok", title: "Brain key created", body: "Copy it now — it's hashed at rest." });
      onMinted();
    } catch (e) {
      toast.push({ kind: "err", title: "Create failed", body: (e as Error).message });
    } finally {
      setPending(false);
    }
  }

  async function copy(s: string, label: string) {
    try {
      await navigator.clipboard.writeText(s);
      toast.push({ kind: "ok", title: `${label} copied` });
    } catch {
      toast.push({ kind: "err", title: `Couldn't copy ${label.toLowerCase()}`, body: "Browser blocked clipboard access — select and copy manually." });
    }
  }

  const install = key
    ? brainInstallCommand(key)
    : null;

  return (
    <div className="surface p-8 anim-up">
      <div className="flex items-center gap-3 mb-6">
        <span className="w-9 h-9 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)] flex items-center justify-center text-[14px] font-bold shrink-0">1</span>
        <div>
          <div className="font-semibold text-[15px]">Get your first brain online</div>
          <div className="text-[13px] text-[var(--color-muted)]">A brain is a Claude Code session on your laptop that powers the bots — your laptop is fine.</div>
        </div>
      </div>

      {!key ? (
        <div className="flex gap-2 max-w-md">
          <input
            value={labelValue} onChange={(e) => setLabel(e.target.value)}
            placeholder="Brain label (e.g. macbook-air)"
            className="flex-1"
            aria-label="Brain label"
          />
          <button className="btn btn-primary" disabled={pending} onClick={mint}>
            {pending ? "Creating…" : "Create brain"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="surface p-4 bg-[var(--color-bg-soft)]">
            <div className="label-cap mb-2">Your key (shown once)</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 mono text-[12.5px] break-all text-[var(--color-accent)]">{key}</code>
              <button className="btn btn-outline text-[11px] py-1.5 px-2.5 shrink-0" onClick={() => copy(key, "Key")}>Copy</button>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <span className="w-9 h-9 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)] flex items-center justify-center text-[14px] font-bold shrink-0">2</span>
            <div className="flex-1">
              <div className="font-semibold text-[14px]">Run this on your laptop</div>
              <div className="text-[12px] text-[var(--color-muted)]">
                Clones our <a className="underline" href="https://github.com/pattern-ai-labs/gstack-joins-meeting/blob/main/hosted/worker.py" target="_blank" rel="noopener">open-source worker</a> (read it first if you like),
                installs its Python deps, starts the brain. No <span className="mono">curl | bash</span>, runs entirely on your machine.
              </div>
            </div>
            <button className="btn btn-primary text-[12px] shrink-0" onClick={() => copy(install!, "Command")}>Copy</button>
          </div>
          <pre className="surface p-4 bg-[var(--color-bg-soft)] text-[11.5px] mono leading-relaxed overflow-x-auto whitespace-pre-wrap">
{install}
          </pre>
          {/* (step 3 rendered below via WaitForGreenStep) */}

          <WaitForGreenStep />
        </div>
      )}
    </div>
  );
}

/* Step 3 — honest connection status: grey until the freshly-minted brain
 * connects, green when live (5s poll). Was a hardcoded blinking orange dot. */
function WaitForGreenStep() {
  const { live } = useMintedBrainLive(true);
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="w-9 h-9 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)] flex items-center justify-center text-[14px] font-bold shrink-0">3</span>
      <div className="flex-1">
        <div className="font-semibold text-[14px]">{live ? "Your brain is live" : "Wait for the green dot"}</div>
        <div className="text-[12px] text-[var(--color-muted)]">
          {live
            ? "Connected — it shows up in the right rail. Now dispatch."
            : "Grey until the brain connects — flips green automatically (checks every 5 seconds)."}
        </div>
      </div>
      <span className={`dot ${live ? "dot-ok pulse" : "dot-mute"}`} />
    </div>
  );
}
