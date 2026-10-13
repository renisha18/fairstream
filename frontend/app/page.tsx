"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onboard } from "@/lib/account";
import { continueWithPasskey, friendlyError } from "@/lib/passkey";
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
    setStatus("Waiting for Face ID…");
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
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-3xl font-semibold">FairStream</h1>
      <p className="max-w-sm text-zinc-600 dark:text-zinc-400">
        Pay only for the seconds you watch. Never more than $7.99 a month.
      </p>
      <button
        className="rounded-full bg-black px-6 py-3 text-white disabled:opacity-50 dark:bg-white dark:text-black"
        disabled={status !== null}
        onClick={handleContinue}
      >
        {status ?? "Continue with Face ID"}
      </button>
      {error && <p className="max-w-sm text-red-600">{error}</p>}
    </main>
  );
}
