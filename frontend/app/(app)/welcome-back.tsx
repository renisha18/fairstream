"use client";

import { useState } from "react";
import Link from "next/link";
import { friendlyError, unlock } from "@/lib/passkey";
import { useSession } from "../session";
import { Logo } from "../logo";

// Shown after a reload: keys only live in memory, so one passkey prompt brings them back.
// The URL doesn't change, so the viewer lands back on the page they were on.
export function WelcomeBack() {
  const { setIdentity } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    setBusy(true);
    setError(null);
    try {
      setIdentity(await unlock());
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <Logo size="lg" />
        <p className="text-muted">Welcome back — confirm with your fingerprint to continue.</p>
        <button className="btn-primary mt-4 w-full py-2.5" disabled={busy} onClick={handleContinue}>
          {busy ? "Waiting for your passkey…" : "Continue"}
        </button>
        {error && <p className="text-muted">{error}</p>}
        <Link href="/" className="text-xs text-faint hover:text-fg">
          Use a different account
        </Link>
      </div>
    </main>
  );
}
