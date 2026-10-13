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
import { CapProgress } from "../cap-progress";

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
    return error ? <p className="text-muted">{error}</p> : <p className="text-faint">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="page-title">Account</h1>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="panel space-y-2 p-6">
          <p className="label">Balance</p>
          <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">
            {formatDollars(info.balance)}
          </p>
        </section>

        <section className="panel space-y-3 p-6">
          <p className="label">This month</p>
          <CapProgress spent={info.monthlySpent} cap={info.monthlyCap} />
        </section>
      </div>

      <section className="panel space-y-4 p-6">
        <h2 className="section-title">Withdraw</h2>

        {!pending && (
          <>
            <p className="text-muted">Take out your whole balance. It’s ready two minutes after you ask.</p>
            <button
              className="btn-secondary px-4 py-2"
              disabled={busy !== null || info.balance === 0n}
              onClick={() => run("requesting")}
            >
              {busy === "requesting" ? "Starting withdrawal…" : "Withdraw balance"}
            </button>
          </>
        )}

        {pending && remaining !== null && remaining > 0 && (
          <p className="text-muted">
            Ready in <span className="text-fg tabular-nums">{formatCountdown(remaining)}</span>. Playback is paused
            until the withdrawal completes.
          </p>
        )}

        {pending && remaining === 0 && (
          <button className="btn-primary px-4 py-2" disabled={busy !== null} onClick={() => run("completing")}>
            {busy === "completing" ? "Completing withdrawal…" : "Complete withdrawal"}
          </button>
        )}

        {message && <p>{message}</p>}
        {error && <p className="text-muted">{error}</p>}
      </section>

      <section className="panel space-y-2 p-6">
        <h2 className="section-title">Viewing history</h2>
        {viewings && viewings.length === 0 && <p className="text-faint">Nothing watched yet.</p>}
        <ul className="divide-y divide-line">
          {viewings?.map((v) => {
            const video = getVideo(v.videoId);
            return (
              <li key={v.sessionId} className="flex items-center gap-4 py-3">
                <div
                  className="h-10 w-[72px] shrink-0 rounded-md bg-raised bg-cover bg-center"
                  style={video ? { backgroundImage: `url(${video.thumbnail})` } : undefined}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{video?.title ?? "Video"}</p>
                  <p className="text-xs text-muted tabular-nums">
                    {new Date(v.startedAt).toLocaleDateString()} · {formatWatched(v.watchedSeconds)}
                  </p>
                </div>
                <div className="space-y-0.5 text-right">
                  {v.status === "settled" || v.status === "closed" ? (
                    <p className="tabular-nums">{formatDollars(v.charged ?? 0n)}</p>
                  ) : (
                    <p className="text-faint">Pending</p>
                  )}
                  {v.link && (
                    <a
                      href={v.link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted underline underline-offset-4 hover:text-fg"
                    >
                      View receipt
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
