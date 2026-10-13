"use client";

import { useEffect, useState } from "react";
import {
  completeWithdrawal,
  formatDollars,
  getAccount,
  getViewings,
  requestWithdrawal,
  WITHDRAW_DELAY_SECONDS,
  type AccountInfo,
  type Viewing,
} from "@/lib/account";
import { friendlyError } from "@/lib/passkey";
import { formatWatched } from "@/lib/playback";
import { getVideo } from "@/lib/videos";
import { useSession } from "../../session";

// A little slack so we don't offer the button a moment before the network agrees.
const CLOCK_MARGIN_SECONDS = 3;

function formatCountdown(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function AccountPage() {
  const { identity, refreshBalance } = useSession();
  const viewer = identity?.viewer;

  const [info, setInfo] = useState<AccountInfo | null>(null);
  const [viewings, setViewings] = useState<Viewing[] | null>(null);
  const [now, setNow] = useState<number | null>(null); // seconds, ticks while a withdrawal waits
  const [busy, setBusy] = useState<"requesting" | "completing" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Load (and after each action, reload) the balance and viewing history.
  useEffect(() => {
    if (!viewer) return;
    let active = true;
    Promise.all([getAccount(viewer), getViewings(viewer)])
      .then(([account, list]) => {
        if (!active) return;
        setInfo(account);
        setViewings(list);
      })
      .catch(() => active && setError("Couldn't load your account. Please refresh."));
    return () => {
      active = false;
    };
  }, [viewer, reloadKey]);

  const requestedAt = info ? Number(info.withdrawRequestedAt) : 0;
  const pending = requestedAt > 0;

  // Tick once a second while waiting out the 2-minute delay.
  useEffect(() => {
    if (!pending) return;
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    const id = setInterval(tick, 1000);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, [pending]);

  const readyAt = requestedAt + WITHDRAW_DELAY_SECONDS + CLOCK_MARGIN_SECONDS;
  const remaining = pending && now !== null ? Math.max(0, readyAt - now) : null;

  async function run(kind: "requesting" | "completing") {
    if (!viewer || !info) return;
    setBusy(kind);
    setError(null);
    setMessage(null);
    try {
      if (kind === "requesting") {
        await requestWithdrawal(viewer);
      } else {
        const amount = info.balance;
        await completeWithdrawal(viewer);
        setMessage(`${formatDollars(amount)} has been returned to you.`);
      }
      setReloadKey((k) => k + 1);
      refreshBalance().catch(() => {});
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(null);
    }
  }

  if (!info) {
    return error ? <p className="text-red-600">{error}</p> : <p className="text-zinc-500">Loading…</p>;
  }

  const percent = info.monthlyCap > 0n ? Number((info.monthlySpent * 100n) / info.monthlyCap) : 0;
  const capReached = info.monthlySpent >= info.monthlyCap;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Account</h1>

      <section className="space-y-3">
        <p className="text-sm text-zinc-500">Balance</p>
        <p className="text-4xl font-semibold">{formatDollars(info.balance)}</p>

        {!pending && (
          <button
            className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700"
            disabled={busy !== null || info.balance === 0n}
            onClick={() => run("requesting")}
          >
            {busy === "requesting" ? "Starting withdrawal…" : "Withdraw balance"}
          </button>
        )}

        {pending && remaining !== null && remaining > 0 && (
          <p className="text-sm">
            Your withdrawal will be ready in <span className="font-mono">{formatCountdown(remaining)}</span>.
            Playback is paused until it completes.
          </p>
        )}

        {pending && remaining === 0 && (
          <button
            className="rounded-full bg-black px-4 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
            disabled={busy !== null}
            onClick={() => run("completing")}
          >
            {busy === "completing" ? "Completing withdrawal…" : "Complete withdrawal"}
          </button>
        )}

        {message && <p className="text-sm text-green-700 dark:text-green-400">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </section>

      <section className="space-y-2">
        <p className="text-sm text-zinc-500">This month</p>
        <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div className="h-full rounded-full bg-black dark:bg-white" style={{ width: `${Math.min(100, percent)}%` }} />
        </div>
        <p className="text-sm">
          {formatDollars(info.monthlySpent)} of {formatDollars(info.monthlyCap)}
          {capReached && " · You’ve hit this month’s cap — the rest of the month is free."}
        </p>
      </section>

      <section className="space-y-2">
        <p className="text-sm text-zinc-500">Past viewings</p>
        {viewings && viewings.length === 0 && <p className="text-sm">Nothing watched yet.</p>}
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {viewings?.map((v) => (
            <li key={v.sessionId} className="flex items-center justify-between gap-4 py-3 text-sm">
              <div>
                <p className="font-medium">{getVideo(v.videoId)?.title ?? "Video"}</p>
                <p className="text-zinc-500">
                  {new Date(v.startedAt).toLocaleDateString()} · {formatWatched(v.watchedSeconds)}
                </p>
              </div>
              <div className="text-right">
                {v.status === "settled" || v.status === "closed" ? (
                  <p>{formatDollars(v.charged ?? 0n)}</p>
                ) : (
                  <p className="text-zinc-500">Pending</p>
                )}
                {v.link && (
                  <a href={v.link} target="_blank" rel="noreferrer" className="text-xs underline">
                    View receipt
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
