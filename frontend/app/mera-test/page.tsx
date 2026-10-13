"use client";

import { useState } from "react";
import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  isMeraError,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

const CREDENTIAL_KEY = "app.credential";

function deriveEvmKey(prfOutput: Uint8Array, index = 0): Uint8Array {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive(`m/44'/60'/0'/0/${index}`);
  if (node.privateKey === null) throw new Error("derivation produced no key");
  return node.privateKey;
}

// Open a signing session just long enough to read the address, then zero the key.
function deriveAddress(prfOutput: Uint8Array, index: number): string {
  const session = createSecp256k1SigningSession({
    privateKey: deriveEvmKey(prfOutput, index),
  });
  try {
    return toViemAccount(session).address;
  } finally {
    session.end();
  }
}

type Accounts = { wallet: string; meterKey: string };

export default function MeraTestPage() {
  const [accounts, setAccounts] = useState<Accounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(getPrfOutput: () => Promise<Uint8Array>) {
    setBusy(true);
    setError(null);
    setAccounts(null);
    try {
      const prfOutput = await getPrfOutput();
      setAccounts({
        wallet: deriveAddress(prfOutput, 0),
        meterKey: deriveAddress(prfOutput, 1),
      });
    } catch (err) {
      if (isMeraError(err)) {
        setError(`${err.code}: ${err.message}`);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function createPasskey() {
    const created = await createPasskeyWithPrfOutput({
      rp: { id: location.hostname, name: "FairStream" },
      user: { name: "mera-test", displayName: "Mera Test" },
    });
    // Credential metadata only; it holds no key material.
    localStorage.setItem(
      CREDENTIAL_KEY,
      JSON.stringify({
        credentialId: created.credentialId,
        transports: created.transports,
      }),
    );
    return created.prfOutput;
  }

  async function logIn() {
    const stored = localStorage.getItem(CREDENTIAL_KEY);
    const known = stored ? JSON.parse(stored) : undefined;
    const { prfOutput, credentialId } = await getPasskeyPrfOutput({
      rpId: location.hostname,
      credential: known,
    });
    // Nothing stored? The browser may have used a different passkey, so record it.
    localStorage.setItem(
      CREDENTIAL_KEY,
      JSON.stringify(
        known?.credentialId === credentialId ? known : { credentialId },
      ),
    );
    return prfOutput;
  }

  return (
    <main className="mx-auto max-w-xl p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Mera passkey test</h1>

      <div className="flex gap-3">
        <button
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
          disabled={busy}
          onClick={() => run(createPasskey)}
        >
          Create passkey
        </button>
        <button
          className="rounded border px-4 py-2 disabled:opacity-50"
          disabled={busy}
          onClick={() => run(logIn)}
        >
          Log in with existing passkey
        </button>
      </div>

      {accounts && (
        <div className="space-y-2 font-mono text-sm break-all">
          <p>
            <span className="font-sans font-medium">Account 0 (wallet): </span>
            {accounts.wallet}
          </p>
          <p>
            <span className="font-sans font-medium">
              Account 1 (meter key):{" "}
            </span>
            {accounts.meterKey}
          </p>
        </div>
      )}

      {error && <p className="text-red-600 break-all">{error}</p>}
    </main>
  );
}
