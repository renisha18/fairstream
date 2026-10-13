"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isMeraError } from "@category-labs/mera";
import { onboard } from "@/lib/account";
import { createAccount, friendlyError, signIn, type Identity } from "@/lib/passkey";
import { Logo } from "./logo";
import { useSession } from "./session";

type Mode = "signin" | "create";

export default function LoginPage() {
  const router = useRouter();
  const { identity, setIdentity } = useSession();
  const [mode, setMode] = useState<Mode | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (identity) router.replace("/library");
  }, [identity, router]);

  async function start(next: Mode) {
    setMode(next);
    setError(null);
    setStatus("Waiting for your passkey…");
    try {
      const id: Identity = next === "create" ? await createAccount() : await signIn();
      setStatus(id.isNew ? "Setting up your account…" : "Signing you in…");
      // Safe to call every time: the backend skips accounts it has already set up,
      // and it retries any setup step that failed last time.
      await onboard(id.viewer);
      setIdentity(id);
    } catch (err) {
      setError(
        next === "signin" && isMeraError(err) && err.code === "PASSKEY_OPERATION_FAILED"
          ? "No passkey was chosen. If you’re new to FairStream, choose Create account."
          : friendlyError(err),
      );
      setMode(null);
      setStatus(null);
    }
  }

  const busy = mode !== null;

  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <Logo size="lg" />
        <p className="text-muted">Pay only for the seconds you watch.</p>
        <div className="mt-4 flex w-full flex-col gap-3">
          <button className="btn-primary w-full py-2.5" disabled={busy} onClick={() => start("signin")}>
            {mode === "signin" ? status : "Sign in"}
          </button>
          <button className="btn-secondary w-full py-2.5" disabled={busy} onClick={() => start("create")}>
            {mode === "create" ? status : "Create account"}
          </button>
        </div>
        {error && <p className="text-muted">{error}</p>}
        <p className="mt-4 text-xs text-faint">
          Your account lives in your passkey, so it’s the same on every device your passkey syncs to.
        </p>
      </div>
    </main>
  );
}
