// Talking to the backend, and adding funds from account 0.
import { createWalletClient, formatUnits, type Address, type Hash, type LocalAccount } from "viem";
import { BACKEND_URL, chain, fairStream, publicClient, transport, usdc } from "./chain";
import { withWallet } from "./passkey";

export const TOP_UP_AMOUNT = 5_000_000n; // $5.00 at 6 decimals

export type AccountInfo = {
  balance: bigint;
  monthlySpent: bigint;
  monthlyCap: bigint;
  withdrawRequestedAt: bigint;
};

async function backend<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed with ${res.status}`);
  return res.json() as Promise<T>;
}

/** Gives a new account its starter funds. The backend skips accounts it has already set up. */
export function onboard(viewer: Address) {
  return backend<unknown>("/api/onboard", { viewer });
}

export async function getAccount(viewer: Address): Promise<AccountInfo> {
  const raw = await backend<Record<keyof AccountInfo, string>>(`/api/account/${viewer}`);
  return {
    balance: BigInt(raw.balance),
    monthlySpent: BigInt(raw.monthlySpent),
    monthlyCap: BigInt(raw.monthlyCap),
    withdrawRequestedAt: BigInt(raw.withdrawRequestedAt),
  };
}

export function formatDollars(amount: bigint): string {
  return Number(formatUnits(amount, 6)).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

async function send(
  account: LocalAccount,
  call: { address: Address; abi: typeof usdc.abi; functionName: string; args: readonly unknown[] },
): Promise<Hash> {
  const client = createWalletClient({ account, chain, transport });
  // Monad charges the declared limit, so declare the estimate plus 20% instead of a big round number.
  const estimate = await publicClient.estimateContractGas({ ...call, account });
  const hash = await client.writeContract({ ...call, gas: (estimate * 12n) / 10n });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("payment failed");
  return hash;
}

/** Approve FairStream to take $5, then deposit it, with the meter key attached. */
export function addFunds(viewer: Address, meterKey: Address) {
  return withWallet(viewer, async (account) => {
    await send(account, {
      address: usdc.address,
      abi: usdc.abi,
      functionName: "approve",
      args: [fairStream.address, TOP_UP_AMOUNT],
    });
    await send(account, {
      address: fairStream.address,
      abi: fairStream.abi,
      functionName: "deposit",
      args: [TOP_UP_AMOUNT, meterKey],
    });
  });
}
