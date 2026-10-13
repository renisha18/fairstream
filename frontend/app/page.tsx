"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onboard } from "@/lib/account";
import { continueWithPasskey, friendlyError } from "@/lib/passkey";
import { Logo } from "./logo";
import { useSession } from "./session";

export default function LoginPage() {
  const router = useRouter();
  const { identity, setIdentity } = useSession();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (identity) router.replace("/library");
  }, [identity, router]);

  async function handleContinue() {
    setError(null);
    setStatus("Waiting for your passkey…");
    try {
      const next = await continueWithPasskey();
      setStatus(next.isNew ? "Setting up your account…" : "Signing you in…");
      // Safe to call every time: the backend skips accounts it has already set up,
      // and it retries any setup step that failed last time.
      await onboard(next.viewer);
      setIdentity(next);
    } catch (err) {
      setError(friendlyError(err));
      setStatus(null);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <Logo size="lg" />
        <p className="text-muted">Pay only for the seconds you watch.</p>
        <button className="btn-primary mt-4 w-full py-2.5" disabled={status !== null} onClick={handleContinue}>
          {status ?? "Continue with passkey"}
        </button>
        {error && <p className="text-muted">{error}</p>}
      </div>
    </main>
  );
}
