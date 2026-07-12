"use client";
import { useRef } from "react";

/**
 * Holds a boolean `true` for `graceMs` after the last time the input was true,
 * so a momentarily-false input doesn't flap the UI. The broker's worker
 * registry can briefly miss a connected brain (a poll that lands on a broker
 * instance without it, a 1s reconnect gap), and without this the status dot
 * flickers online/offline every few seconds. As long as *some* poll sees it
 * live within the grace window, the UI stays "live".
 *
 * Callers poll on an interval (SWR refreshInterval), so the component
 * re-renders regularly and the grace window expires on a later render once the
 * brain is genuinely gone.
 */
export function useSticky(value: boolean, graceMs = 25000): boolean {
  const lastTrue = useRef(0);
  if (value) lastTrue.current = Date.now();
  return value || Date.now() - lastTrue.current < graceMs;
}
