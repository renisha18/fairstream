// Turns a session's latest signed receipt into an on-chain payment.
import { parseEventLogs, type Hash } from "viem";
import { readContract, writeContract } from "./chain.js";
import { fairStream } from "./deployments.js";
import { save, type Session } from "./store.js";

const MAX_ATTEMPTS = 3;

export type SettleResult = { txHash?: Hash; charged: string };

export async function settleSession(s: Session): Promise<SettleResult> {
  if (!s.latest) {
    s.status = "closed";
    s.charged = "0";
    save();
    return { charged: "0" };
  }

  s.status = "settling";
  save();

  try {
    const alreadySettled = await readContract<boolean>({
      address: fairStream.address,
      abi: fairStream.abi,
      functionName: "settled",
      args: [s.id],
    });
    if (alreadySettled) {
      // Settled before a restart; nothing more to send.
      s.status = "settled";
      save();
      return { txHash: s.settleTx, charged: s.charged ?? "unknown" };
    }

    const receipt = await writeContract(`settle ${s.id}`, {
      address: fairStream.address,
      abi: fairStream.abi,
      functionName: "settle",
      args: [s.viewer, s.id, BigInt(s.latest.amount), s.latest.signature],
    });

    const [event] = parseEventLogs({
      abi: fairStream.abi,
      eventName: "SessionSettled",
      logs: receipt.logs,
    }) as unknown as { args: { charged: bigint } }[];

    s.status = "settled";
    s.settleTx = receipt.transactionHash;
    s.charged = event.args.charged.toString();
    s.error = undefined;
    save();
    return { txHash: s.settleTx, charged: s.charged };
  } catch (err) {
    s.settleAttempts += 1;
    s.status = s.settleAttempts >= MAX_ATTEMPTS ? "failed" : "open";
    s.error = err instanceof Error ? err.message : String(err);
    save();
    throw err;
  }
}
