"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { addFunds, formatDollars } from "@/lib/account";
import { friendlyError } from "@/lib/passkey";
import { useSession } from "../session";

export function Header() {
  const { identity, balance, refreshBalance } = useSession();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    refreshBalance().catch(() => setError("Couldn't load your balance."));
  }, [refreshBalance]);

  async function handleAddFunds() {
    if (!identity) return;
    setAdding(true);
    setError(null);
    try {
      await addFunds(identity.viewer, identity.meterKey);
      await refreshBalance();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setAdding(false);
    }
  }

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 p-4">
        <Link href="/library" className="text-lg font-semibold">
          FairStream
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {adding ? "Adding funds…" : `Balance ${balance === null ? "…" : formatDollars(balance)}`}
          </span>
          <button
            className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700"
            disabled={adding}
            onClick={handleAddFunds}
          >
            Add $5
          </button>
        </div>
      </div>
      {error && <p className="mx-auto max-w-4xl px-4 pb-3 text-sm text-red-600">{error}</p>}
    </header>
  );
}
