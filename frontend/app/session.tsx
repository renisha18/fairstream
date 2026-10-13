"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { getAccount } from "@/lib/account";
import type { Identity } from "@/lib/passkey";
import type { Summary } from "@/lib/playback";

type SessionState = {
  identity: Identity | null;
  setIdentity: (identity: Identity | null) => void;
  balance: bigint | null;
  refreshBalance: () => Promise<void>;
  /** Summary of the last video left by navigating away, shown on the library page. */
  lastSummary: Summary | null;
  setLastSummary: (summary: Summary | null) => void;
};

const SessionContext = createContext<SessionState | null>(null);

// Who is signed in and their balance, shared by every page. Memory only:
// reloading the page signs the user out.
export function SessionProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [lastSummary, setLastSummary] = useState<Summary | null>(null);

  const refreshBalance = useCallback(async () => {
    if (!identity) return;
    const info = await getAccount(identity.viewer);
    setBalance(info.balance);
  }, [identity]);

  return (
    <SessionContext value={{ identity, setIdentity, balance, refreshBalance, lastSummary, setLastSummary }}>
      {children}
    </SessionContext>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
