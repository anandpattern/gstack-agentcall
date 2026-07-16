"use client";
import { SignedIn, SignedOut } from "@/lib/auth";
import { Marketing } from "@/components/Marketing";
import { DispatchPanel } from "@/components/DispatchPanel";
import { ActiveCallsRail } from "@/components/ActiveCallsRail";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { MemberActiveCalls } from "@/components/MemberActiveCalls";
import { useApiSWR } from "@/lib/api";
import { useSticky } from "@/lib/useSticky";
import Link from "next/link";
import type { User, Worker, WorkerKey } from "@/lib/types";

export default function Home() {
  return (
    <>
      <SignedOut><Marketing /></SignedOut>
      <SignedIn><Dashboard /></SignedIn>
    </>
  );
}

function Dashboard() {
  const { data: meResp } = useApiSWR<{ user: User }>("/api/me");
  const isAdmin = meResp?.user?.role === "admin";

  return isAdmin ? <AdminDashboard /> : <MemberDashboard />;
}

/* Admin sees the full ops view — brain pool, live calls, onboarding for
 * their own brains. */
function AdminDashboard() {
  const { data: workersResp, mutate } = useApiSWR<{ workers: Worker[] }>("/api/workers");
  const noBrain = (workersResp?.workers ?? []).length === 0;
  return (
    <div className="flex flex-col xl:flex-row">
      <div className="flex-1 min-w-0 px-6 lg:px-8 py-6 xl:py-8 xl:max-w-3xl 2xl:max-w-5xl">
        {noBrain && <div className="mb-8"><OnboardingFlow onMinted={() => mutate()} /></div>}
        <DispatchPanel />
      </div>
      <div className="xl:order-last px-6 lg:px-8 xl:px-0 pb-6 xl:pb-0">
        <ActiveCallsRail />
      </div>
    </div>
  );
}

/* Member sees just the dispatch action + a live "your active call"
 * card that appears after they dispatch (and hides again on recall).
 * The brain pool + admin audit are invisible. The "demo busy" modal
 * (Phase B) handles the "no brain available" case at dispatch time. */
function MemberDashboard() {
  return (
    <div className="flex-1 min-w-0 px-6 lg:px-8 py-6 xl:py-8 max-w-4xl mx-auto">
      <MyBrainStatus />
      <MemberActiveCalls />
      <DispatchPanel />
    </div>
  );
}

/* A member who brought their own brain sees its live status here — green when a
 * brain key is connected (dispatches can run on their machine), muted when
 * registered-but-offline. Pool-only members (no keys) see nothing. Polls every
 * 10s so the dot flips as the brain connects/disconnects. */
function MyBrainStatus() {
  const { data: keysResp } = useApiSWR<{ keys: WorkerKey[] }>("/api/worker-keys");
  const { data: workersResp } = useApiSWR<{ workers: Worker[] }>("/api/workers", { refreshInterval: 5000 });
  const keys = (keysResp?.keys ?? []).filter((k) => !k.revoked);
  const workers = workersResp?.workers ?? [];
  const online = keys.filter((k) => workers.some((w) => w.key_prefix === k.key_hash_prefix));
  // Sticky so a single broker poll that misses the brain doesn't flap the dot.
  // MUST be called before any early return — a hook after a conditional
  // return changes the hook order between renders (React #310, took prod
  // down with a client-side exception on 2026-07-17).
  const live = useSticky(online.length > 0);
  if (keys.length === 0) return null;
  return (
    <Link href="/byob" className="card flex items-center gap-3 mb-6 hover:bg-[var(--color-panel-2)] transition">
      <span className={`dot ${live ? "dot-ok pulse" : "dot-mute"}`} />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-[13.5px]">{live ? "Your brain is live" : "Your brain is offline"}</div>
        <div className="text-[11.5px] text-[var(--color-muted)]">
          {live
            ? "dispatches can run on your machine"
            : `${keys.length} brain${keys.length > 1 ? "s" : ""} registered · start it on your laptop`}
        </div>
      </div>
      <span className="text-[12px] text-[var(--color-muted)] shrink-0">Manage →</span>
    </Link>
  );
}
