"use client";
import { useEffect, useState } from "react";
import { useApi, useApiSWR } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { User, Assignment, Worker } from "@/lib/types";

export default function AdminPage() {
  const call = useApi();
  const toast = useToast();
  const { data: usersResp,   mutate: refreshUsers } = useApiSWR<{ users: User[] }>("/api/admin/users");
  const { data: workersResp }                       = useApiSWR<{ workers: Worker[] }>("/api/workers");
  const { data: assignsResp }                       = useApiSWR<{ assignments: Assignment[] }>("/api/assignments");

  const users = usersResp?.users ?? [];
  const workers = workersResp?.workers ?? [];
  const assignments = assignsResp?.assignments ?? [];

  async function setRole(uid: string, role: "admin" | "member") {
    try {
      await call(`/api/admin/users/${uid}/role`, { method: "POST", body: JSON.stringify({ role }) });
      toast.push({ kind: "ok", title: "Role updated" });
      refreshUsers();
    } catch (e) {
      toast.push({ kind: "err", title: "Update failed", body: (e as Error).message });
    }
  }

  const totalMin = users.reduce((sum, u) => sum + u.minutes_used, 0);
  const activeNow = assignments.filter((a) => a.status === "started").length;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8 anim-fade space-y-8">
      <header>
        <h1 className="text-[22px] sm:text-[26px] font-semibold tracking-tight">Admin</h1>
        <p className="text-[13px] text-[var(--color-fg-soft)] mt-1">
          You see everything: every user, every brain, every dispatch.
        </p>
      </header>

      {/* metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="Users"            value={users.length} />
        <Metric label="Brains online"    value={workers.length} sub={`${workers.filter((w) => w.state === "idle").length} idle`} />
        <Metric label="Active calls"     value={activeNow} />
        <Metric label="Total minutes"    value={totalMin} />
      </div>

      {/* live ops — every active call + queue, with end/cancel controls */}
      <LiveOps />

      {/* users */}
      <section>
        <h2 className="text-[15px] font-semibold mb-3">All users</h2>
        <div className="surface overflow-x-auto">
          <table className="w-full text-[12.5px] min-w-[460px]">
            <thead className="bg-[var(--color-panel-2)] text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">User</th>
                <th className="px-4 py-2.5 text-left font-semibold">Plan</th>
                <th className="px-4 py-2.5 text-right font-semibold">Usage</th>
                <th className="px-4 py-2.5 text-right font-semibold">Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-[var(--color-border)] hover:bg-[var(--color-panel-2)] transition">
                  <td className="px-4 py-3">
                    <div className="font-medium">{u.display_name || u.email || u.id}</div>
                    <div className="text-[11px] text-[var(--color-muted)]">{u.email || u.id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge badge-muted">{u.plan}</span>
                  </td>
                  <td className="px-4 py-3 text-right mono text-[11.5px] text-[var(--color-fg-soft)]">
                    {u.minutes_used}/{u.quota_minutes} min
                  </td>
                  <td className="px-4 py-3 text-right">
                    <select
                      value={u.role}
                      onChange={(e) => setRole(u.id, e.target.value as "admin" | "member")}
                      className="!py-1 !px-2 !w-auto inline-block text-[11px]"
                    >
                      <option value="member">member</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* brains */}
      <section>
        <h2 className="text-[15px] font-semibold mb-3">All brains <span className="text-[12px] text-[var(--color-muted)] font-normal ml-1">({workers.length})</span></h2>
        {workers.length === 0 ? (
          <div className="surface p-6 text-[12.5px] text-[var(--color-muted)] text-center">No brains online.</div>
        ) : (
          <div className="space-y-2">
            {workers.map((w) => (
              <div key={w.id} className="card flex items-center gap-3">
                <span className={`dot ${w.state === "idle" ? "dot-ok" : "dot-warn"}`} />
                <div className="flex-1">
                  <div className="text-[13px] font-medium">{w.name}</div>
                  <div className="text-[11px] text-[var(--color-muted)]">{w.platform} · owner <span className="mono">{w.owner_user_id}</span></div>
                </div>
                <span className="mono text-[11px] text-[var(--color-muted)]">{w.id}</span>
                <span className={`badge ${w.state === "idle" ? "badge-ok" : "badge-warn"}`}>{w.state}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* recent dispatches */}
      <section>
        <h2 className="text-[15px] font-semibold mb-3">Recent dispatches</h2>
        <div className="surface overflow-x-auto">
          <table className="w-full text-[12.5px] min-w-[520px]">
            <thead className="bg-[var(--color-panel-2)] text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Status</th>
                <th className="px-4 py-2.5 text-left font-semibold">User</th>
                <th className="px-4 py-2.5 text-left font-semibold">Specialists</th>
                <th className="px-4 py-2.5 text-right font-semibold">Duration</th>
              </tr>
            </thead>
            <tbody>
              {assignments.slice(0, 25).map((a) => (
                <tr key={a.id} className="border-t border-[var(--color-border)] hover:bg-[var(--color-panel-2)] transition">
                  <td className="px-4 py-3">
                    <span className={`badge ${
                      a.status === "started" ? "badge-warn" :
                      a.status === "ended"   ? "badge-ok"   :
                      "badge-bad"
                    }`}>{a.status}</span>
                  </td>
                  <td className="px-4 py-3 mono text-[11.5px] text-[var(--color-fg-soft)]">{a.user_id}</td>
                  <td className="px-4 py-3 text-[var(--color-fg-soft)]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <div className="flex -space-x-1">
                        {a.specialists.slice(0, 5).map((id) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={id} src={`/avatars/${id}.svg`} alt="" title={id}
                               width={20} height={20}
                               className="w-5 h-5 rounded-full ring-1 ring-[var(--color-panel)]" loading="lazy" />
                        ))}
                      </div>
                      <span className="text-[11.5px]">{a.specialists.join(", ")}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right mono text-[11.5px] text-[var(--color-fg-soft)]">
                    {a.billable_seconds ? `${a.billable_seconds}s` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="card">
      <div className="label-cap">{label}</div>
      <div className="text-[24px] font-semibold mt-1 tracking-tight">{value}</div>
      {sub && <div className="text-[11px] text-[var(--color-muted)] mt-1">{sub}</div>}
    </div>
  );
}

/* ─── Live ops ─────────────────────────────────────────────────────────
 * The admin's control surface for what's happening RIGHT NOW: every live
 * call (any user) with an End button, and the dispatch queue with Cancel.
 * The broker's /api/recall and /api/assignments/{id}/cancel are already
 * admin-aware (bypass ownership), so this is pure UI. Polls every 5s. */

function useTicker(): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}

function LiveOps() {
  const call = useApi();
  const toast = useToast();
  const { data, mutate } = useApiSWR<{ assignments: Assignment[] }>(
    "/api/assignments", { refreshInterval: 5000 });
  const all = data?.assignments ?? [];
  const live = all.filter((a) => a.status === "started");
  const queued = all.filter((a) => a.status === "queued");

  async function end(a: Assignment) {
    if (!confirm(`End this call? The specialists leave the meeting immediately.`)) return;
    try {
      const r = await call<{ recalled: number }>("/api/recall", {
        method: "POST",
        body: JSON.stringify(a.worker_id ? { worker_id: a.worker_id } : {}),
      });
      toast.push({ kind: "ok", title: "Call ended", body: `${r.recalled} brain${r.recalled === 1 ? "" : "s"} freed` });
      mutate();
    } catch (e) {
      toast.push({ kind: "err", title: "Couldn't end call", body: (e as Error).message });
    }
  }

  async function cancel(a: Assignment) {
    try {
      await call(`/api/assignments/${a.id}/cancel`, { method: "POST", body: "{}" });
      toast.push({ kind: "ok", title: "Removed from queue" });
      mutate();
    } catch (e) {
      toast.push({ kind: "err", title: "Couldn't cancel", body: (e as Error).message });
    }
  }

  return (
    <section>
      <h2 className="text-[15px] font-semibold mb-3">
        Live calls
        {live.length > 0 && <span className="text-[12px] text-[var(--color-muted)] font-normal ml-1.5">({live.length})</span>}
      </h2>
      {live.length === 0 ? (
        <div className="surface p-4 text-[12.5px] text-[var(--color-muted)]">No live calls right now.</div>
      ) : (
        <div className="space-y-2">
          {live.map((a) => <LiveCallRow key={a.id} a={a} onEnd={() => end(a)} />)}
        </div>
      )}

      {queued.length > 0 && (
        <>
          <h2 className="text-[15px] font-semibold mb-3 mt-6">
            Queue <span className="text-[12px] text-[var(--color-muted)] font-normal ml-1.5">({queued.length} waiting)</span>
          </h2>
          <div className="space-y-2">
            {queued.map((a, i) => (
              <div key={a.id} className="card flex flex-wrap items-center gap-3">
                <span className="mono text-[12px] text-[var(--color-muted)] shrink-0">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate">{a.specialists.join(", ")}</div>
                  <div className="text-[11px] text-[var(--color-muted)] mono truncate">{a.user_id}</div>
                </div>
                <button className="btn btn-outline text-[11px] py-1.5 px-2.5 shrink-0" onClick={() => cancel(a)}>
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function LiveCallRow({ a, onEnd }: { a: Assignment; onEnd: () => void }) {
  useTicker();
  const start = a.dispatched_at
    ? new Date(a.dispatched_at).getTime()
    : a.created_at ? new Date(a.created_at).getTime() : Date.now();
  const elapsed = Math.max(0, Math.round((Date.now() - start) / 1000));
  const meetHost = (() => { try { return new URL(a.meet_url).hostname; } catch { return a.meet_url; } })();
  return (
    <div className="card flex flex-wrap items-center gap-3">
      <span className="dot dot-warn pulse shrink-0" />
      <div className="flex -space-x-1 shrink-0">
        {a.specialists.slice(0, 5).map((id) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={id} src={`/avatars/${id}.svg`} alt="" title={id} width={22} height={22}
               className="w-[22px] h-[22px] rounded-full ring-1 ring-[var(--color-panel)]" loading="lazy" />
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium truncate">{a.specialists.join(", ")}</div>
        <div className="text-[11px] text-[var(--color-muted)] mono flex items-center gap-2 flex-wrap">
          <span>{String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}</span>
          <span className="opacity-50">·</span>
          <span className="truncate">{meetHost}</span>
          <span className="opacity-50">·</span>
          <span className="truncate">{a.user_id}</span>
        </div>
      </div>
      <a href={a.meet_url} target="_blank" rel="noopener noreferrer"
         className="btn btn-outline text-[11px] py-1.5 px-2.5 shrink-0">Open</a>
      <button className="btn btn-danger text-[11px] py-1.5 px-2.5 shrink-0" onClick={onEnd}>
        End call
      </button>
    </div>
  );
}
