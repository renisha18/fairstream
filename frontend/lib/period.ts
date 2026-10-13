"use client";

// The contract's cap period is block.timestamp / 30 days: fixed 30-day blocks counted
// from 1970, not calendar months. Display only; billing never reads this.
import { useSyncExternalStore } from "react";

export const PERIOD_SECONDS = 2_592_000; // 30 days

function periodEndMs(): number {
  return (Math.floor(Date.now() / 1000 / PERIOD_SECONDS) + 1) * PERIOD_SECONDS * 1000;
}

// Re-check once a minute so an open page rolls over to the next period by itself.
function subscribe(onChange: () => void) {
  const id = setInterval(onChange, 60_000);
  return () => clearInterval(id);
}

/** When the current cap period ends (ms), or null during server rendering. */
export function usePeriodEnd(): number | null {
  return useSyncExternalStore(subscribe, periodEndMs, () => null);
}

/** "2 Nov" */
export function formatResetDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
