// Blockchain clients for the relayer, plus a queue so its transactions go out one at a time.
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Abi,
  type Address,
  type Hash,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { DEFAULT_RPC, txLink } from "./deployments.js";

const rawKey = process.env.RELAYER_PRIVATE_KEY?.trim();
if (!rawKey) throw new Error("RELAYER_PRIVATE_KEY is missing from backend/.env");
const relayer = privateKeyToAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as Hex);

const transport = http(process.env.MONAD_RPC?.trim() || DEFAULT_RPC);
export const publicClient = createPublicClient({ chain: monadTestnet, transport });
const walletClient = createWalletClient({ account: relayer, chain: monadTestnet, transport });
export const relayerAddress = relayer.address;

// Each job starts only after the previous one is confirmed, so nonces never clash.
let tail: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = tail.then(job);
  tail = run.catch(() => {});
  return run;
}

async function confirm(label: string, hash: Hash): Promise<TransactionReceipt> {
  console.log(`[tx] ${label}: ${txLink(hash)}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} failed on chain: ${txLink(hash)}`);
  return receipt;
}

export function sendNative(label: string, to: Address, value: bigint) {
  return enqueue(async () => {
    // A plain transfer always uses exactly 21,000 gas.
    const hash = await walletClient.sendTransaction({ to, value, gas: 21_000n });
    return confirm(label, hash);
  });
}

type Call = { address: Address; abi: Abi; functionName: string; args: readonly unknown[] };

export function writeContract(label: string, call: Call) {
  return enqueue(async () => {
    // Monad charges the declared limit, so declare the estimate plus a 20% margin
    // rather than a large fixed number. Estimating also catches reverts before sending.
    const estimate = await publicClient.estimateContractGas({ ...call, account: relayer });
    const hash = await walletClient.writeContract({ ...call, gas: (estimate * 12n) / 10n });
    return confirm(label, hash);
  });
}

export function readContract<T>(call: Call): Promise<T> {
  return publicClient.readContract(call) as Promise<T>;
}
