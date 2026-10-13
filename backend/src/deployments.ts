// Contract addresses, ABIs and the receipt format, loaded from shared/deployments.json.
// No secrets in here, so scripts can import it too.
import { readFileSync } from "node:fs";
import type { Abi, Address, Hash } from "viem";

type Deployment = { address: Address; deployBlock: number; abi: Abi };
type Deployments = {
  chainId: number;
  rpcUrl: string;
  explorer: string;
  contracts: { MockUSDC: Deployment; FairStream: Deployment };
};

const deployments: Deployments = JSON.parse(
  readFileSync(new URL("../../shared/deployments.json", import.meta.url), "utf8"),
);

export const CHAIN_ID = deployments.chainId;
export const EXPLORER = deployments.explorer;
export const DEFAULT_RPC = deployments.rpcUrl;
export const usdc = deployments.contracts.MockUSDC;
export const fairStream = deployments.contracts.FairStream;

// $0.01 (6 decimals) per 10 seconds of playback.
export const PRICE_STEP = 10_000n;
export const STEP_SECONDS = 10;
// First 30 seconds of every viewing are free, so the first receipt (10 billable seconds)
// is expected after 40 seconds of playback. Must match the frontend.
export const FREE_PREVIEW_SECONDS = 30;

// Must match the contract: EIP712("FairStream", "1") and RECEIPT_TYPEHASH.
export const receiptDomain = {
  name: "FairStream",
  version: "1",
  chainId: CHAIN_ID,
  verifyingContract: fairStream.address,
} as const;

export const receiptTypes = {
  Receipt: [
    { name: "viewer", type: "address" },
    { name: "sessionId", type: "bytes32" },
    { name: "amount", type: "uint256" },
  ],
} as const;

export const txLink = (hash: Hash) => `${EXPLORER}/tx/${hash}`;
