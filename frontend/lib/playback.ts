// Viewing sessions: start, signed receipts every 10 seconds, end.
import type { Address, Hex } from "viem";
import deployments from "../../shared/deployments.json";
import { BACKEND_URL, fairStream } from "./chain";
import { meterAccount } from "./passkey";

export const PRICE_STEP = 10_000n; // $0.01
export const STEP_SECONDS = 10;
export const PRICE_PER_MINUTE = (PRICE_STEP * 60n) / BigInt(STEP_SECONDS); // $0.06

export type Summary = { watchedSeconds: number; paid: bigint; link?: string };

// Must match the contract's EIP712("FairStream", "1") and RECEIPT_TYPEHASH exactly,
// or the signatures won't check out.
const receiptDomain = {
  name: "FairStream",
  version: "1",
  chainId: deployments.chainId,
  verifyingContract: fairStream.address,
} as const;

const receiptTypes = {
  Receipt: [
    { name: "viewer", type: "address" },
    { name: "sessionId", type: "bytes32" },
    { name: "amount", type: "uint256" },
  ],
} as const;

async function post(path: string, body: unknown) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

export type StartResult = { sessionId: Hex } | { error: "no-balance" | "withdrawal" | "other" };

export async function startSession(viewer: Address, videoId: string): Promise<StartResult> {
  const { status, json } = await post("/api/session/start", { viewer, videoId });
  if (status === 200) return { sessionId: json.sessionId };
  if (status === 402) return { error: "no-balance" };
  if (status === 409) return { error: "withdrawal" };
  return { error: "other" };
}

export type HeartbeatReply = { ok: true } | { ok?: false; stop: true; reason: string };

/** Signs "this session has now cost `amount`" with the meter key and sends it. */
export async function sendHeartbeat(sessionId: Hex, viewer: Address, amount: bigint): Promise<HeartbeatReply> {
  const signature = await meterAccount().signTypedData({
    domain: receiptDomain,
    types: receiptTypes,
    primaryType: "Receipt",
    message: { viewer, sessionId, amount },
  });
  const { status, json } = await post("/api/heartbeat", { sessionId, amount: amount.toString(), signature });
  if (status !== 200) throw new Error(`heartbeat failed with ${status}`);
  return json;
}

export async function endSession(sessionId: Hex): Promise<{ charged: bigint; link?: string }> {
  const { status, json } = await post("/api/session/end", { sessionId });
  if (status !== 200) throw new Error(`ending session failed with ${status}`);
  return { charged: BigInt(json.charged ?? "0"), link: json.link };
}

/**
 * For a closing tab: sendBeacon still delivers after the page is gone.
 * It's sent as text/plain because that is the only type a beacon can send
 * to another origin without a CORS preflight; the backend parses it as JSON.
 */
export function endSessionOnUnload(sessionId: Hex) {
  navigator.sendBeacon(`${BACKEND_URL}/api/session/end`, JSON.stringify({ sessionId }));
}

export function formatWatched(seconds: number): string {
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}
