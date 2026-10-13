// Passkey login and the two accounts derived from it.
// Keys live only in this module's memory. localStorage holds just the passkey's ID as a
// hint for the browser; it contains no key material.
import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  isMeraError,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import type { Address, LocalAccount } from "viem";

const CREDENTIAL_KEY = "app.credential";
const WALLET_INDEX = 0;
const METER_INDEX = 1;

export type Identity = {
  viewer: Address; // account 0, holds the balance
  meterKey: Address; // account 1, signs playback receipts
  isNew: boolean;
};

// The meter key stays unlocked while the app is open so receipts can be signed
// every 10 seconds without a Face ID prompt each time.
let meterSession: Secp256k1SigningSession | undefined;

function deriveEvmKey(prfOutput: Uint8Array, index: number): Uint8Array {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive(`m/44'/60'/0'/0/${index}`);
  seed.fill(0);
  if (node.privateKey === null) throw new Error("derivation produced no key");
  return node.privateKey;
}

// The session keeps its own copy of the key, so wipe ours straight away.
function openSession(prfOutput: Uint8Array, index: number): Secp256k1SigningSession {
  const privateKey = deriveEvmKey(prfOutput, index);
  try {
    return createSecp256k1SigningSession({ privateKey });
  } finally {
    privateKey.fill(0);
  }
}

// Passkeys only exist in the browser. Every passkey call starts here, so nothing can run during
// server rendering, and a browser without passkey support gets a clear message.
function requirePasskeySupport() {
  if (typeof window === "undefined") throw new Error("Passkeys can only be used in the browser.");
  if (!window.PublicKeyCredential || !navigator.credentials) throw new PasskeyUnsupportedError();
}

class PasskeyUnsupportedError extends Error {
  constructor() {
    super("This browser doesn't support passkeys.");
  }
}

// The passkey's domain ("relying party ID"), read from the page at runtime. Accounts are tied
// to it: the same passkey on the same domain always gives the same accounts, on any device the
// passkey syncs to (iCloud Keychain, Google Password Manager, 1Password).
//
// NEXT_PUBLIC_RP_ID can pin it to a parent domain (e.g. "fairstream.app" for www.fairstream.app),
// but only if the current page is on that domain. The browser rejects any other value outright,
// with no prompt at all, so a wrong or mistyped setting is ignored here instead.
function rpId(): string {
  const host = window.location.hostname;
  const configured = process.env.NEXT_PUBLIC_RP_ID?.trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[/:].*$/, "");
  if (configured && (host === configured || host.endsWith(`.${configured}`))) return configured;
  if (configured) {
    console.warn(`[passkey] NEXT_PUBLIC_RP_ID "${configured}" doesn't match this site (${host}); using ${host}.`);
  }
  return host;
}

// The saved passkey ID is only a hint: it points the browser straight at the passkey used
// last time on this device. Nothing secret is in it, and signing in works without it.
function storedCredential() {
  try {
    const stored = localStorage.getItem(CREDENTIAL_KEY);
    return stored ? JSON.parse(stored) : undefined;
  } catch {
    return undefined;
  }
}

function rememberCredential(credentialId: string, transports?: readonly string[]) {
  const known = storedCredential();
  // Keep the saved transports if it's the same passkey; they help the browser find it faster.
  const next = known?.credentialId === credentialId ? known : { credentialId, transports };
  localStorage.setItem(CREDENTIAL_KEY, JSON.stringify(next));
}

/** True when this browser has signed in before, so a reload can offer "Welcome back". */
export function hasSavedPasskey(): boolean {
  return storedCredential() !== undefined;
}

// Turns the passkey's secret bytes into the two accounts and opens the meter session.
function openIdentity(prfOutput: Uint8Array, isNew: boolean): Identity {
  try {
    // Only the address of account 0 is kept; its session ends immediately.
    const wallet = openSession(prfOutput, WALLET_INDEX);
    const viewer = toViemAccount(wallet).address;
    wallet.end();

    meterSession?.end();
    meterSession = openSession(prfOutput, METER_INDEX);
    return { viewer, meterKey: toViemAccount(meterSession).address, isNew };
  } finally {
    prfOutput.fill(0);
  }
}

/** "Create account": makes a new passkey, which means a new, empty account. */
export async function createAccount(): Promise<Identity> {
  requirePasskeySupport();
  const created = await createPasskeyWithPrfOutput({
    rp: { id: rpId(), name: "FairStream" },
    // The date tells passkeys apart in the browser's list if someone makes more than one.
    user: {
      name: `FairStream · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
      displayName: "FairStream account",
    },
  });
  rememberCredential(created.credentialId, created.transports);
  return openIdentity(created.prfOutput, true);
}

/**
 * "Sign in": no credential ID is passed, so the browser lists every FairStream passkey it can
 * reach, including ones synced from another device.
 */
export async function signIn(): Promise<Identity> {
  requirePasskeySupport();
  const { prfOutput, credentialId } = await getPasskeyPrfOutput({ rpId: rpId() });
  rememberCredential(credentialId);
  return openIdentity(prfOutput, false);
}

/** After a reload: one prompt, aimed at the passkey used last time if we have the hint. */
export async function unlock(): Promise<Identity> {
  requirePasskeySupport();
  const { prfOutput, credentialId } = await getPasskeyPrfOutput({
    rpId: rpId(),
    credential: storedCredential(),
  });
  rememberCredential(credentialId);
  return openIdentity(prfOutput, false);
}

/** The always-on meter key, for signing receipts. */
export function meterAccount(): LocalAccount {
  if (!meterSession) throw new Error("not signed in");
  return toViemAccount(meterSession);
}

/**
 * Asks for Face ID, unlocks account 0 for one job (a deposit or withdrawal),
 * then ends the session whatever happens.
 */
export async function withWallet<T>(
  expectedViewer: Address,
  job: (account: LocalAccount) => Promise<T>,
): Promise<T> {
  requirePasskeySupport();
  const { prfOutput } = await getPasskeyPrfOutput({
    rpId: rpId(),
    credential: storedCredential(),
  });
  let session: Secp256k1SigningSession;
  try {
    session = openSession(prfOutput, WALLET_INDEX);
  } finally {
    prfOutput.fill(0);
  }
  try {
    const account = toViemAccount(session);
    if (account.address.toLowerCase() !== expectedViewer.toLowerCase()) {
      throw new Error("That passkey belongs to a different account.");
    }
    return await job(account);
  } finally {
    session.end();
  }
}

export function signOut() {
  meterSession?.end();
  meterSession = undefined;
}

/** Plain-language message for anything thrown during login or adding funds. */
// The browser's own reason behind a failed passkey call (a DOMException name such as
// "NotAllowedError" or "SecurityError"), which Mera keeps as the error's cause.
function browserReason(err: unknown): string | undefined {
  const cause = err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined;
  return cause instanceof Error ? cause.name : undefined;
}

/**
 * True when the browser found no passkey to use, or the person closed the prompt. WebAuthn
 * deliberately reports both the same way, so a site can't probe which passkeys exist.
 */
export function isNoPasskeyChosen(err: unknown): boolean {
  return isMeraError(err) && err.code === "PASSKEY_OPERATION_FAILED" && browserReason(err) === "NotAllowedError";
}

export function friendlyError(err: unknown): string {
  // Keep the technical detail in the console for debugging; the screen gets plain words.
  console.error("[passkey]", isMeraError(err) ? err.code : "", browserReason(err) ?? "", err);

  if (err instanceof PasskeyUnsupportedError) {
    return "This browser doesn't support passkeys. Try an up-to-date Chrome, Safari or Edge.";
  }
  if (isMeraError(err)) {
    switch (err.code) {
      case "PRF_UNAVAILABLE":
        return "This passkey can't be used with FairStream. On Chrome, save it to Google Password Manager, or use iCloud Keychain or 1Password.";
      case "PASSKEY_OPERATION_FAILED":
        switch (browserReason(err)) {
          case "SecurityError":
            return "Passkeys aren't available at this web address. Open FairStream at its main address and try again.";
          case "NotAllowedError":
            return "The passkey prompt was closed or timed out. Please try again.";
          case "NotSupportedError":
            return "This device can't create a passkey FairStream can use. Try iCloud Keychain, Google Password Manager or 1Password.";
        }
        return "The passkey prompt didn't finish. Please try again.";
      case "CRYPTO_UNAVAILABLE":
        return "Please open FairStream over a secure (https) connection.";
      case "SESSION_ENDED":
        return "Your session ended. Please sign in again.";
    }
    return `Something went wrong (${err.code}). Please try again.`;
  }
  if (err instanceof Error && err.message === "That passkey belongs to a different account.") {
    return err.message;
  }
  // fetch() throws a TypeError when the server can't be reached (down, wrong URL, or blocked).
  if (err instanceof TypeError) {
    return "Couldn’t reach the FairStream server. Please try again in a moment.";
  }
  return "Something went wrong. Please try again.";
}
