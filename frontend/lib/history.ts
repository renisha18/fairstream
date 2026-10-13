// Viewing history and lifetime totals for the account page.
// Read from the Envio indexer (on-chain records) when it's reachable, otherwise
// from the backend's own session records.
import type { Address } from "viem";
import { getViewings, type Viewing } from "./account";
import { EXPLORER } from "./chain";

const ENVIO_URL = process.env.NEXT_PUBLIC_ENVIO_URL;
const ENVIO_TIMEOUT_MS = 4_000;

export type Totals = { deposited: bigint; charged: bigint; withdrawn: bigint };

/** Like a backend Viewing, but watch time is unknown for payments the backend has no record of. */
export type HistoryItem = Omit<Viewing, "watchedSeconds"> & { watchedSeconds: number | null };

export type History = {
  source: "indexer" | "backend";
  totals: Totals | null; // only the indexer has lifetime totals
  viewings: HistoryItem[];
};

type EnvioResponse = {
  data?: {
    Viewer: { totalDeposited: string; totalCharged: string; totalWithdrawn: string }[];
    Viewing: { sessionId: string; charged: string; timestamp: number; transactionHash: string }[];
  };
  errors?: unknown[];
};

const QUERY = `
  query History($id: String!) {
    Viewer(where: { id: { _eq: $id } }) {
      totalDeposited
      totalCharged
      totalWithdrawn
    }
    Viewing(where: { viewer_id: { _eq: $id } }, order_by: { timestamp: desc }) {
      sessionId
      charged
      timestamp
      transactionHash
    }
  }
`;

async function queryEnvio(viewer: Address): Promise<NonNullable<EnvioResponse["data"]>> {
  if (!ENVIO_URL) throw new Error("NEXT_PUBLIC_ENVIO_URL is not set");
  const res = await fetch(ENVIO_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // The indexer keys viewers by lowercase address.
    body: JSON.stringify({ query: QUERY, variables: { id: viewer.toLowerCase() } }),
    signal: AbortSignal.timeout(ENVIO_TIMEOUT_MS),
  });
  const json = (await res.json()) as EnvioResponse;
  if (!res.ok || json.errors || !json.data) throw new Error("indexer query failed");
  return json.data;
}

export async function getHistory(viewer: Address): Promise<History> {
  // The backend knows which video and how long; the indexer knows what was paid on chain.
  const backend = getViewings(viewer);

  try {
    const [data, sessions] = await Promise.all([queryEnvio(viewer), backend.catch(() => [] as Viewing[])]);
    const bySession = new Map(sessions.map((s) => [s.sessionId.toLowerCase(), s]));
    const totals = data.Viewer[0];

    return {
      source: "indexer",
      totals: totals
        ? {
            deposited: BigInt(totals.totalDeposited),
            charged: BigInt(totals.totalCharged),
            withdrawn: BigInt(totals.totalWithdrawn),
          }
        : { deposited: 0n, charged: 0n, withdrawn: 0n },
      viewings: data.Viewing.map((v) => {
        const known = bySession.get(v.sessionId.toLowerCase());
        return {
          sessionId: v.sessionId,
          videoId: known?.videoId ?? "",
          startedAt: known?.startedAt ?? v.timestamp * 1000,
          status: "settled",
          watchedSeconds: known?.watchedSeconds ?? null,
          charged: BigInt(v.charged),
          link: `${EXPLORER}/tx/${v.transactionHash}`,
        };
      }),
    };
  } catch {
    // Indexer unreachable (or not configured): fall back to the backend's records.
    return { source: "backend", totals: null, viewings: await backend };
  }
}
