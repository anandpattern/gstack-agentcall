# gstack-meeting.com — Production Readiness

_Audit + hardening pass, 2026-06-13. Two independent reviews (production-readiness + security) plus fixes implemented on branch `production-hardening`. Nothing here is deployed — review, then deploy._

## TL;DR

The product **works** end-to-end (dispatch → voice bots → queue → transcript → notes → recall, all functioning with graceful degrade) and the **auth/crypto/secrets are genuinely well-built** (Clerk JWT verified by JWKS, worker keys are 192-bit and sha256-hashed, per-user data scoping is solid, no committed secrets).

It was **not** safe to open public signups because the **cost controls didn't fire** and there were two billing-theft paths. I've fixed the cost controls on a branch. **One architectural decision (BYOB + the pool key) is still yours to make before launch.**

---

## ✅ Fixed on branch `production-hardening` (review + deploy)

All in the broker; syntax-checked; **not deployed**. A broker redeploy applies them.

| # | Fix | File |
|---|-----|------|
| 1 | **Quota is now real** — `minutes_used` is billed on call-end (atomic + idempotent CTE, no double-count). The existing `quota_minutes DEFAULT 60` cap now actually fires. This was THE cost hole. | `broker/db.py` `update_assignment_status` |
| 2 | **Per-call duration clamp** — client `max_duration_min` was trusted verbatim (could send `999999`); now clamped to `MAX_CALL_MIN` (45, env-tunable). | `broker/main.py` `dispatch` |
| 3 | **Duration-enforcement sweep** — a 30s background loop force-recalls any call past `MAX_CALL_MIN`. The worker never honored `end_at`, so a bot in a populated room ran indefinitely; this is the real centralized auto-stop. | `broker/main.py` `duration_sweep_loop` |
| 4 | **Per-user concurrency cap** — one member can no longer seize every brain in the pool (`MAX_CONCURRENT_PER_USER`, default 2). | `broker/main.py` `dispatch` + `db.count_active_assignments` |
| 5 | **Rate limit** — sliding-window per-user limiter on dispatch (10/min, env-tunable) to blunt scripted hammering. | `broker/main.py` `_rate_ok` |
| 6 | **Auth bypass closed** — the spoofable `X-Dev-User-Id` fallback now requires explicit `GSTACK_DEV_AUTH=1`; a prod broker that forgets `CLERK_JWKS_URL` now fails **closed** (401) instead of trusting an attacker header. | `broker/auth.py` |
| 7 | **Dev header no longer advertised** in prod CORS. | `broker/main.py` `_add_cors` |

Members are subject to all guards; **admins are exempt** (the operator runs the pool).

---

## 🚧 Needs YOUR decision before public launch

### P0 — BYOB hands the shared AgentCall pool key to arbitrary machines
**The single most important issue.** Today, any member can mint a worker key, connect a "bring your own brain" worker, dispatch a job to their own worker, and read `agentcall_api_key` (the **shared, centrally-funded pool key**) off the WebSocket. With it they can run unlimited AgentCall bot-minutes on your account, entirely outside the broker. (HTTP surface is clean — the key never reaches the browser/REST; the leak is only the BYOB worker WS.)

Pick one:
- **(A) BYOB = bring your own brain *and* your own AgentCall key** (recommended). The pool key only ever goes to admin-owned workers; BYOB users enter their AgentCall key in the `/byob` flow. Clean trust boundary, and it's honest ("your brain, your bot account").
- **(B) Admin-only pool, no BYOB on the shared key** — members must run their own everything.
- **(C) Per-dispatch short-lived scoped AgentCall token** — only if AgentCall supports minting one server-side; avoids ever sharing the permanent key.

I did **not** implement this — it changes the BYOB UX and is your call. Until decided, treat BYOB as trusted-users-only.

### P1 — Switch sign-in to embedded components (also fixes today's blank page)
Today the app redirects to Clerk's hosted Account Portal (`accounts.gstack-meeting.com`), which sits behind Cloudflare. The blank sign-in page you hit was **Cloudflare rate-limiting your IP** after a burst of sign-in tabs — transient, self-clearing, not a code bug. But embedding sign-in removes the dependency entirely. **Scaffolding already exists** (`app/sign-in/[[...rest]]/page.tsx`, `app/sign-up/...`, middleware leaves them public). To switch: set `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in` + `SIGN_UP_URL=/sign-up` in Vercel, set `signInUrl`/`signUpUrl` on `<ClerkProvider>`, and flip the `<SignInButton mode="modal">` entry points to `<Link href="/sign-in">`. ~config + 2 files.

### P1 — Two config corrections (quick, but they restart the broker)
- **CORS origin is stale**: `GSTACK_ALLOWED_ORIGINS=https://gstack-joins-meeting.vercel.app` (old preview). Set `https://gstack-meeting.com`. (Works today only because the frontend proxies same-origin.)
- **Bind `azp`/authorized-party** in `verify_jwt` so a stolen Clerk token can't be replayed from `curl`/Postman straight at the public broker (CORS only constrains browsers).

---

## ✅ Verified GOOD (no action)
- **Features #32–35 are fully shipped** (live transcript + say-box, dispatch stepper, post-call notes, dispatch queue) — both broker and frontend, with 404 degrade-guards for old brokers. The `in_progress` task status was stale.
- **Resilience**: broker-down, empty-pool, dispatch-fail, worker-disconnect, recall, orphan rows — all degrade gracefully / self-heal.
- **Authz**: per-assignment routes (transcript, say, cancel, recall) are tenant-scoped; admin routes gated on role. No IDOR found.
- **Secrets**: none committed. `.env.local` gitignored; only local-dev DSN + placeholders in tracked files.

## Dead code (cleanup, not blocking)
`PoolBusyModal` + the 503 `demo_busy` branch in `DispatchPanel.tsx` are unreachable now that a busy pool queues (202) instead of 503. The BYOB upsell that modal carried is silently dead — either delete it or surface "bring your own brain" from `QueuedCard`.

---

## 💡 Idea parked: OpenRouter as a brain option
You mentioned integrating **OpenRouter** "if someone wants to use it." Today the brain is a Claude Code session (shared pool or BYOB). An **OpenRouter brain** would let users without Claude Code bring any model via their own OpenRouter key — widening the top of funnel. It fits the BYOB worker model: the worker would call OpenRouter's chat-completions instead of driving a Claude session. Worth scoping as its own feature after launch-blockers. (Lower fidelity than the gstack persona prompts tuned for Claude — would need persona-prompt tuning per model.)

---

## Before you open public signups — checklist
- [ ] Decide BYOB pool-key model (A/B/C above) and implement
- [ ] Deploy branch `production-hardening` (the 7 cost/auth fixes) to the broker
- [ ] Set `GSTACK_ALLOWED_ORIGINS=https://gstack-meeting.com`; add `azp` binding
- [ ] (Recommended) Switch to embedded sign-in
- [ ] Verify Vercel is on a **Pro** plan (Hobby = no commercial use per ToS)
- [ ] Confirm a sane `quota_minutes` default for real usage (60 lifetime min may be tight — consider a daily reset)
