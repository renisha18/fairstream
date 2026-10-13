// Copies ../shared/deployments.json into this app before it builds or runs.
//
// Hosts that build only one folder (Render from backend/, Vercel from frontend/) may not
// have ../shared at all, so each app keeps its own committed copy. When ../shared is
// present it's the source of truth and the copy is refreshed; when it's missing, the
// committed copy is used as-is.
//
// Usage: node scripts/sync-deployments.mjs <destination relative to the app folder>
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const appDir = process.cwd();
const source = resolve(appDir, "../shared/deployments.json");
const destination = resolve(appDir, process.argv[2] ?? "deployments.json");

if (existsSync(source)) {
  copyFileSync(source, destination);
  console.log(`deployments.json: copied from ../shared to ${process.argv[2] ?? "deployments.json"}`);
} else if (existsSync(destination)) {
  console.log("deployments.json: ../shared not available here, using the committed copy");
} else {
  console.error("deployments.json: missing. Commit a copy or build from the repo root.");
  process.exit(1);
}

// Fail the build early on a broken file rather than at runtime.
const { chainId, contracts } = JSON.parse(readFileSync(destination, "utf8"));
if (!chainId || !contracts?.FairStream?.address || !contracts?.MockUSDC?.address) {
  console.error("deployments.json: missing chainId or contract addresses");
  process.exit(1);
}
