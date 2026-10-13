import "dotenv/config";
import cors from "cors";
import express, { type Response } from "express";
import { randomBytes } from "node:crypto";
import { isAddress, isHex, parseEther, toHex, verifyTypedData, type Address, type Hex } from "viem";
import { readContract, relayerAddress, sendNative, writeContract } from "./chain.js";
import {
  fairStream,
  PRICE_STEP,
  receiptDomain,
  receiptTypes,
  STEP_SECONDS,
  txLink,
  usdc,
} from "./deployments.js";
import { settleSession } from "./settle.js";
import { save, store, type Session } from "./store.js";

const ONBOARD_GAS = parseEther("0.05");
const ONBOARD_USDC = 10_000_000n; // 10 USDC
const IDLE_MS = 60_000;
const SWEEP_MS = 30_000;

const app = express();
app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());
// A closing tab ends its session with navigator.sendBeacon, which can only send
// text/plain to another origin. Parse those bodies as JSON too.
app.use(express.text({ type: "text/plain" }));
app.use((req, _res, next) => {
  if (typeof req.body === "string") {
    try {
      req.body = JSON.parse(req.body);
    } catch {
      req.body = {};
    }
  }
  next();
});

function fsRead<T>(functionName: string, args: readonly unknown[]) {
  return readContract<T>({ address: fairStream.address, abi: fairStream.abi, functionName, args });
}

function badRequest(res: Response, error: string) {
  res.status(400).json({ error });
}

function parseAmount(value: unknown): bigint | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return null;
}

// 1. Give a new viewer a little MON for fees and 10 test USDC. Once per address.
const onboardingInFlight = new Set<string>();

app.post("/api/onboard", async (req, res) => {
  const viewer = req.body?.viewer;
  if (typeof viewer !== "string" || !isAddress(viewer)) return badRequest(res, "invalid viewer address");

  const key = viewer.toLowerCase();
  const existing = store.onboarded[key];
  if (existing?.done) {
    return res.json({ skipped: true, gasTx: existing.gasTx, mintTx: existing.mintTx });
  }
  if (onboardingInFlight.has(key)) return res.status(409).json({ error: "onboarding already in progress" });

  onboardingInFlight.add(key);
  try {
    const record = (store.onboarded[key] ??= { done: false });
    // Each step is saved as it finishes, so a retry after a failure skips what already went through.
    if (!record.gasTx) {
      record.gasTx = (await sendNative(`onboard MON → ${viewer}`, viewer, ONBOARD_GAS)).transactionHash;
      save();
    }
    if (!record.mintTx) {
      const receipt = await writeContract(`onboard mint → ${viewer}`, {
        address: usdc.address,
        abi: usdc.abi,
        functionName: "mint",
        args: [viewer, ONBOARD_USDC],
      });
      record.mintTx = receipt.transactionHash;
      save();
    }
    record.done = true;
    save();
    res.json({
      gasTx: record.gasTx,
      mintTx: record.mintTx,
      links: { gasTx: txLink(record.gasTx), mintTx: txLink(record.mintTx) },
    });
  } finally {
    onboardingInFlight.delete(key);
  }
});

// 2. Check the viewer can pay, then open a session.
app.post("/api/session/start", async (req, res) => {
  const { viewer, videoId } = req.body ?? {};
  if (typeof viewer !== "string" || !isAddress(viewer)) return badRequest(res, "invalid viewer address");
  if (typeof videoId !== "string" || !videoId) return badRequest(res, "missing videoId");

  const [balance, meterKey, withdrawRequestedAt] = await Promise.all([
    fsRead<bigint>("balance", [viewer]),
    fsRead<Address>("meterKey", [viewer]),
    fsRead<bigint>("withdrawRequestedAt", [viewer]),
  ]);

  if (balance === 0n) return res.status(402).json({ error: "no balance" });
  if (/^0x0{40}$/i.test(meterKey)) return res.status(403).json({ error: "no meter key set" });
  if (withdrawRequestedAt !== 0n) return res.status(409).json({ error: "withdrawal pending" });

  const id = toHex(randomBytes(32));
  const now = Date.now();
  const session: Session = {
    id,
    viewer,
    videoId,
    startedAt: now,
    lastHeartbeatAt: now,
    status: "open",
    settleAttempts: 0,
  };
  store.sessions[id] = session;
  save();

  res.json({
    sessionId: id,
    pricePerStep: PRICE_STEP.toString(),
    stepSeconds: STEP_SECONDS,
    balance: balance.toString(),
  });
});

// 3. Accept the next signed receipt for an open session.
app.post("/api/heartbeat", async (req, res) => {
  const { sessionId, signature } = req.body ?? {};
  const amount = parseAmount(req.body?.amount);
  if (typeof sessionId !== "string") return badRequest(res, "missing sessionId");
  if (amount === null) return badRequest(res, "amount must be a whole number");
  if (typeof signature !== "string" || !isHex(signature)) return badRequest(res, "invalid signature");

  const s = store.sessions[sessionId];
  if (!s) return res.json({ stop: true, reason: "unknown session" });
  if (s.status !== "open") return res.json({ stop: true, reason: `session is ${s.status}` });

  const [meterKey, balance] = await Promise.all([
    fsRead<Address>("meterKey", [s.viewer]),
    fsRead<bigint>("balance", [s.viewer]),
  ]);

  const valid = await verifyTypedData({
    address: meterKey,
    domain: receiptDomain,
    types: receiptTypes,
    primaryType: "Receipt",
    message: { viewer: s.viewer, sessionId: s.id, amount },
    signature: signature as Hex,
  }).catch(() => false);
  if (!valid) return res.json({ stop: true, reason: "signature does not match meter key" });

  const last = s.latest ? BigInt(s.latest.amount) : 0n;
  if (amount < last) return res.json({ stop: true, reason: "amount lower than previous receipt" });
  if (amount > last + PRICE_STEP) return res.json({ stop: true, reason: "amount jumped more than one step" });
  if (amount > balance) return res.json({ stop: true, reason: "insufficient balance" });
  // The session may have been ended or auto-settled while we were checking.
  if (s.status !== "open") return res.json({ stop: true, reason: `session is ${s.status}` });

  s.latest = { amount: amount.toString(), signature: signature as Hex, receivedAt: Date.now() };
  s.lastHeartbeatAt = s.latest.receivedAt;
  save();
  res.json({ ok: true });
});

// 4. Charge the latest receipt and close the session.
app.post("/api/session/end", async (req, res) => {
  const s = store.sessions[req.body?.sessionId];
  if (!s) return res.status(404).json({ error: "unknown session" });

  if (s.status === "settled" || s.status === "closed") {
    return res.json({ txHash: s.settleTx, link: s.settleTx && txLink(s.settleTx), charged: s.charged ?? "0" });
  }
  if (s.status === "settling") return res.status(409).json({ error: "settlement already in progress" });

  // Only for the viewing history; billing always uses the signed receipts.
  const watched = req.body?.watchedSeconds;
  if (typeof watched === "number" && Number.isFinite(watched) && watched >= 0) {
    s.watchedSeconds = Math.min(Math.floor(watched), 24 * 60 * 60);
  }

  const result = await settleSession(s);
  res.json({ ...result, link: result.txHash && txLink(result.txHash) });
});

// Past viewings for the account page, newest first.
app.get("/api/sessions/:viewer", (req, res) => {
  const viewer = req.params.viewer;
  if (!isAddress(viewer)) return badRequest(res, "invalid viewer address");

  const sessions = Object.values(store.sessions)
    .filter((s) => s.viewer.toLowerCase() === viewer.toLowerCase())
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((s) => {
      const billed = s.latest ? BigInt(s.latest.amount) : 0n;
      return {
        sessionId: s.id,
        videoId: s.videoId,
        startedAt: s.startedAt,
        status: s.status,
        // Sessions the player didn't report (e.g. auto-settled) fall back to the billed time.
        watchedSeconds: s.watchedSeconds ?? Number((billed / PRICE_STEP) * BigInt(STEP_SECONDS)),
        charged: s.charged ?? null,
        link: s.settleTx ? txLink(s.settleTx) : null,
      };
    });
  res.json({ sessions });
});

// 5. Balance and this period's spend for the account screen.
app.get("/api/account/:viewer", async (req, res) => {
  const viewer = req.params.viewer;
  if (!isAddress(viewer)) return badRequest(res, "invalid viewer address");

  const month = await fsRead<bigint>("currentMonth", []);
  const [balance, spent, cap, withdrawRequestedAt] = await Promise.all([
    fsRead<bigint>("balance", [viewer]),
    fsRead<bigint>("monthlySpent", [viewer, month]),
    fsRead<bigint>("monthlyCap", []),
    fsRead<bigint>("withdrawRequestedAt", [viewer]),
  ]);

  res.json({
    balance: balance.toString(),
    monthlySpent: spent.toString(),
    monthlyCap: cap.toString(),
    withdrawRequestedAt: withdrawRequestedAt.toString(),
  });
});

app.use((err: unknown, _req: express.Request, res: Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : "internal error" });
});

// 6. Settle sessions whose player went quiet (tab closed, network dropped).
setInterval(() => {
  const cutoff = Date.now() - IDLE_MS;
  for (const s of Object.values(store.sessions)) {
    if (s.status !== "open" || s.lastHeartbeatAt > cutoff) continue;
    settleSession(s).then(
      (r) => console.log(`[auto-settle] ${s.id} charged ${r.charged}`),
      (err) => console.error(`[auto-settle] ${s.id} failed (attempt ${s.settleAttempts}):`, err.message ?? err),
    );
  }
}, SWEEP_MS);

const port = Number(process.env.PORT?.trim() || 4000);
app.listen(port, () => {
  console.log(`FairStream backend on http://localhost:${port}`);
  console.log(`Relayer: ${relayerAddress}`);
});
