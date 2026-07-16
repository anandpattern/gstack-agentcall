"use client";
import { useApiSWR } from "@/lib/api";
import type { Worker, WorkerKey } from "@/lib/types";

/**
 * After the user mints a brain key, tells the setup UI whether that brain has
 * actually connected — so the "wait for the green dot" step can be honest:
 * grey while waiting, green when live (was a hardcoded blinking orange that
 * never changed). Identifies "the key just minted" as the newest non-revoked
 * key, and matches it against connected workers by key prefix. Polls every 5s.
 *
 * Pass `enabled=false` before a key exists to skip the polling.
 */
export function useMintedBrainLive(enabled: boolean): { live: boolean } {
  const { data: keysResp } = useApiSWR<{ keys: WorkerKey[] }>(
    enabled ? "/api/worker-keys" : null);
  const { data: workersResp } = useApiSWR<{ workers: Worker[] }>(
    enabled ? "/api/workers" : null, { refreshInterval: 5000 });
  if (!enabled) return { live: false };
  const minted = (keysResp?.keys ?? [])
    .filter((k) => !k.revoked)
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];
  const live = !!minted &&
    (workersResp?.workers ?? []).some((w) => w.key_prefix === minted.key_hash_prefix);
  return { live };
}
