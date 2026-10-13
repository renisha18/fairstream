// End-to-end test against a running backend: new viewer → onboard → deposit → watch → settle.
// Run the server first (npm run dev), then: npm run simulate
import "dotenv/config";
import { createPublicClient, createWalletClient, formatUnits, http, type Abi, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { DEFAULT_RPC, fairStream, PRICE_STEP, receiptDomain, receiptTypes, txLink, usdc } from "../src/deployments.js";

const API = process.env.API_URL ?? `http://localhost:${process.env.PORT?.trim() || 4000}`;
const DEPOSIT = 5_000_000n; // 5 USDC

const transport = http(process.env.MONAD_RPC?.trim() || DEFAULT_RPC);
const publicClient = createPublicClient({ chain: monadTestnet, transport });

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json as T;
}

async function send(
  account: PrivateKeyAccount,
  label: string,
  call: { address: Address; abi: Abi; functionName: string; args: readonly unknown[] },
) {
  const wallet = createWalletClient({ account, chain: monadTestnet, transport });
  const estimate = await publicClient.estimateContractGas({ ...call, account });
  const hash = await wallet.writeContract({ ...call, gas: (estimate * 12n) / 10n });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} failed: ${txLink(hash)}`);
  console.log(`  ${label}: ${txLink(hash)}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // Throwaway keys that live only in this process.
  const viewer = privateKeyToAccount(generatePrivateKey());
  const meter = privateKeyToAccount(generatePrivateKey());
  console.log(`Viewer:    ${viewer.address}`);
  console.log(`Meter key: ${meter.address}`);

  console.log("\n1. Onboarding");
  const onboard = await api<{ links: { gasTx: string; mintTx: string } }>("/api/onboard", { viewer: viewer.address });
  console.log(`  MON sent:    ${onboard.links.gasTx}`);
  console.log(`  USDC minted: ${onboard.links.mintTx}`);

  console.log("\n2. Approve and deposit 5 USDC");
  await send(viewer, "approve", {
    address: usdc.address,
    abi: usdc.abi,
    functionName: "approve",
    args: [fairStream.address, DEPOSIT],
  });
  await send(viewer, "deposit", {
    address: fairStream.address,
    abi: fairStream.abi,
    functionName: "deposit",
    args: [DEPOSIT, meter.address],
  });

  console.log("\n3. Start session");
  const { sessionId } = await api<{ sessionId: Hex }>("/api/session/start", {
    viewer: viewer.address,
    videoId: "simulate-video",
  });
  console.log(`  sessionId: ${sessionId}`);

  console.log("\n4. Heartbeats");
  for (let i = 1n; i <= 4n; i++) {
    const amount = PRICE_STEP * i;
    const signature = await meter.signTypedData({
      domain: receiptDomain,
      types: receiptTypes,
      primaryType: "Receipt",
      message: { viewer: viewer.address, sessionId, amount },
    });
    const reply = await api<{ ok?: true; stop?: true; reason?: string }>("/api/heartbeat", {
      sessionId,
      amount: amount.toString(),
      signature,
    });
    console.log(`  receipt ${i} (${formatUnits(amount, 6)} USDC): ${JSON.stringify(reply)}`);
    if (reply.stop) throw new Error(`server stopped the session: ${reply.reason}`);
    await sleep(1_000); // the real player waits 10 seconds
  }

  console.log("\n5. End session");
  const end = await api<{ link?: string; charged: string }>("/api/session/end", { sessionId });
  console.log(`  charged:    ${formatUnits(BigInt(end.charged), 6)} USDC`);
  console.log(`  settlement: ${end.link ?? "(no transaction)"}`);

  const account = await api<{ balance: string }>(`/api/account/${viewer.address}`);
  console.log(`\nViewer balance now: ${formatUnits(BigInt(account.balance), 6)} USDC`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
