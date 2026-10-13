// Sessions and onboarding records, kept in memory and saved to data/store.json.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { Address, Hash, Hex } from "viem";

export type Receipt = { amount: string; signature: Hex; receivedAt: number };

export type Session = {
  id: Hex;
  viewer: Address;
  videoId: string;
  startedAt: number;
  lastHeartbeatAt: number;
  latest?: Receipt;
  status: "open" | "settling" | "settled" | "closed" | "failed";
  settleAttempts: number;
  settleTx?: Hash;
  charged?: string;
  error?: string;
  /** Seconds actually played, as reported by the player when it ended the session. */
  watchedSeconds?: number;
};

export type Onboarding = { gasTx?: Hash; mintTx?: Hash; done: boolean };

type Data = {
  onboarded: Record<string, Onboarding>; // keyed by lowercase address
  sessions: Record<string, Session>; // keyed by sessionId
};

const dir = new URL("../data/", import.meta.url);
const file = new URL("store.json", dir);

export const store: Data = existsSync(file)
  ? JSON.parse(readFileSync(file, "utf8"))
  : { onboarded: {}, sessions: {} };

// A crash mid-settlement leaves sessions as "settling"; reopen them so the timer retries.
for (const s of Object.values(store.sessions)) {
  if (s.status === "settling") s.status = "open";
}

export function save() {
  mkdirSync(dir, { recursive: true });
  const tmp = new URL("store.json.tmp", dir);
  writeFileSync(tmp, JSON.stringify(store, null, 2));
  renameSync(tmp, file);
}
