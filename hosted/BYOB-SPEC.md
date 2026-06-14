# Spec: Frictionless Bring-Your-Own-Brain (platform-provisioned scoped AgentCall key)

_Status: proposed (post-trial build). Owner: Anand + CTO (AgentCall side) + Claude (broker/frontend side)._

## Goal
A regular signed-up user can run **their own brain** (their Claude Code session as a
worker) — shifting the LLM cost to them — **without** ever fetching or pasting an
AgentCall key, and **without** the shared pool key ever leaving the server.

This replaces the interim state (BYOB disabled — `GSTACK_BYOB_ENABLED=0` — members use
the shared pool only) with the real design.

## Why the current pool-key approach can't be opened to members
Today the broker embeds the **shared** `GSTACK_POOL_AGENTCALL_KEY` in the assignment
message sent over the worker WS. If a member runs their own worker, that master key
lands on their machine → they can run unlimited bots on the master account. That's why
member worker-key minting is currently admin-gated.

## The design: per-user scoped, short-lived keys
Instead of the shared master key, the platform mints a **scoped sub-key per BYOB user**,
server-side, using the master AgentCall account. The broker sends *that* key to the
user's worker.

```
User enables BYOB (brings Claude session as worker)
        │
        ▼
Broker, on dispatch for that user:
  1. mint/fetch a SCOPED AgentCall key for user_id
     (budget cap + TTL + revocable, tied to user_id)
  2. put THAT key in the assignment msg (never the pool key)
        │
        ▼
User's worker uses the scoped key → bot joins
  • leak blast radius = one user, capped + revocable (not the master key)
  • zero friction: user never sees or fetches a key
  • cost is per-user metered → cap or bill individually
```

## Work required

### AgentCall (CTO)
Expose a server-to-server endpoint to **mint a scoped sub-key**:
- Input: `user_ref`, `budget_minutes` (or microcents), `ttl`, optional `mode` scope.
- Output: `{ key, key_id, expires_at }`.
- Plus: **revoke by key_id**, and ideally a usage/`balance` read for metering.
- Keys must be independently revocable and budget-capped (the whole point).

### Broker (`hosted/broker`)
- New `agentcall.py` helper: `mint_scoped_key(user_id)` → calls the AgentCall mint
  endpoint with the master cred (a new server secret, e.g. `GSTACK_AGENTCALL_MASTER_KEY`),
  caches `{user_id → (key, expires_at)}`, refreshes on expiry.
- `_assignment_msg`: for **BYOB** (member-owned worker) dispatches, use
  `mint_scoped_key(user_id)` instead of `TRANSIENT_AGENTCALL_KEY`. Admin-pool dispatches
  keep using the pool key (or also move to scoped — cleaner).
- Re-enable member worker-key minting (`GSTACK_BYOB_ENABLED=1`) once the above ships.
- Optional: tie the scoped key's `budget_minutes` to the user's remaining `quota_minutes`.

### Worker (`hosted/worker.py`)
- **No change.** It already uses whatever `agentcall_api_key` arrives in the assignment.

### Frontend (`hosted/gstack-web`)
- `/byob`: drop any "enter your AgentCall key" step — BYOB just means "run the worker
  CLI with your Claude session." Update copy (the worker runs on the user's machine with
  their privileges — be honest about that; see PRODUCTION-READINESS.md P2-5).

## Security properties
- Master AgentCall key never leaves the server.
- Each user gets an independently **revocable, budget-capped, short-TTL** key.
- A leaked scoped key = one user's capped budget, killable instantly by `key_id`.
- Master-key rotation remains the global break-glass.

## Rollout
1. CTO ships the AgentCall mint+revoke endpoints.
2. Broker integration (mint/cache/assign) behind a flag.
3. Flip `GSTACK_BYOB_ENABLED=1`; member worker-key minting reopens.
4. Test: member BYOB dispatch uses a scoped key; verify revoke + budget cap; confirm the
   pool/master key never appears in any assignment to a member worker.

## Until then
Trial runs on the **shared pool + per-user quota** (live now): frictionless, no key
exposure, cost bounded by `quota_minutes` (5h/user). This spec is the upgrade path when
shifting AgentCall cost to users becomes worthwhile.
