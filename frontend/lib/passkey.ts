// Passkey login and the two accounts derived from it.
// Keys live only in this module's memory. localStorage holds just the passkey's ID,
// which lets the browser find the same passkey again and contains no key material.
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

function storedCredential() {
  const stored = localStorage.getItem(CREDENTIAL_KEY);
  return stored ? JSON.parse(stored) : undefined;
}

async function passkeyPrfOutput(): Promise<{ prfOutput: Uint8Array; isNew: boolean }> {
  const known = storedCredential();

  if (!known) {
    const created = await createPasskeyWithPrfOutput({
      rp: { id: location.hostname, name: "FairStream" },
      user: { name: "FairStream viewer", displayName: "FairStream viewer" },
    });
    localStorage.setItem(
      CREDENTIAL_KEY,
      JSON.stringify({ credentialId: created.credentialId, transports: created.transports }),
    );
    return { prfOutput: created.prfOutput, isNew: true };
  }

  const { prfOutput, credentialId } = await getPasskeyPrfOutput({
    rpId: location.hostname,
    credential: known,
  });
  if (known.credentialId !== credentialId) {
    localStorage.setItem(CREDENTIAL_KEY, JSON.stringify({ credentialId }));
  }
  return { prfOutput, isNew: false };
}

/** "Continue with passkey": creates or unlocks the passkey and opens the meter session. */
export async function continueWithPasskey(): Promise<Identity> {
  const { prfOutput, isNew } = await passkeyPrfOutput();
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
  const { prfOutput } = await getPasskeyPrfOutput({
    rpId: location.hostname,
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
export function friendlyError(err: unknown): string {
  if (isMeraError(err)) {
    switch (err.code) {
      case "PRF_UNAVAILABLE":
        return "This passkey can't be used with FairStream. On Chrome, save it to Google Password Manager, or use iCloud Keychain or 1Password.";
      case "PASSKEY_OPERATION_FAILED":
        return "The passkey prompt was cancelled or didn't finish. Please try again.";
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
  return "Something went wrong. Please try again.";
}
