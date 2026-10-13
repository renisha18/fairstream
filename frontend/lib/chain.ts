import { createPublicClient, http, type Abi, type Address } from "viem";
import { monadTestnet } from "viem/chains";
import deployments from "../../shared/deployments.json";

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

export const chain = monadTestnet; // chain id 10143
export const transport = http(deployments.rpcUrl);
export const publicClient = createPublicClient({ chain, transport });

export const usdc = {
  address: deployments.contracts.MockUSDC.address as Address,
  abi: deployments.contracts.MockUSDC.abi as Abi,
};

export const fairStream = {
  address: deployments.contracts.FairStream.address as Address,
  abi: deployments.contracts.FairStream.abi as Abi,
};
