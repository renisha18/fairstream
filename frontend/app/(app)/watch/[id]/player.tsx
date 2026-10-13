"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Hex } from "viem";
import { formatDollars, getAccount } from "@/lib/account";
import {
  endSession,
  endSessionOnUnload,
  PRICE_STEP,
  sendHeartbeat,
  startSession,
  STEP_SECONDS,
  type Summary,
} from "@/lib/playback";
import type { Video } from "@/lib/videos";
import { useSession } from "../../../session";
import { SummaryLine } from "../../summary";

type Phase = "ready" | "watching" | "ended";

const KEEPALIVE_MS = 30_000; // the backend auto-settles after 60s of silence
const ADD_FUNDS = "Add funds to keep watching";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function Player({ video }: { video: Video }) {
  const { identity, refreshBalance, setLastSummary } = useSession();
  const viewer = identity?.viewer;
  const videoRef = useRef<HTMLVideoElement>(null);

  // Billing state lives in refs so video events, timers and cleanup always see current values.
  const phaseRef = useRef<Phase>("ready");
  const watchedRef = useRef(0); // seconds actually played since pressing play
  const lastTimeRef = useRef<number | null>(null); // video position at the previous timeupdate
  const sessionIdRef = useRef<Hex | null>(null);
  const startingRef = useRef(false);
  const sessionBaseRef = useRef(0); // watchedRef value when the current session began billing
  const stepsSentRef = useRef(0); // receipts the backend accepted in the current session
  const earlierPaidRef = useRef(0n); // charged by sessions the backend closed on its own
  const busyRef = useRef(false); // a heartbeat is in flight
  const stoppedRef = useRef(false); // paused by us until the viewer presses play again

  // Display state, copied from the refs once a second.
  const [phase, setPhase] = useState<Phase>("ready");
  const [thisVideo, setThisVideo] = useState(0n);
  const [month, setMonth] = useState<{ spent: bigint; cap: bigint } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  const billedSoFar = () => earlierPaidRef.current + BigInt(stepsSentRef.current) * PRICE_STEP;

  async function loadMonth() {
    if (!viewer) return;
    const info = await getAccount(viewer);
    setMonth({ spent: info.monthlySpent, cap: info.monthlyCap });
  }

  useEffect(() => {
    if (!viewer) return;
    let active = true;
    getAccount(viewer)
      .then((info) => {
        if (active) setMonth({ spent: info.monthlySpent, cap: info.monthlyCap });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [viewer]);

  function pauseWith(message: string) {
    stoppedRef.current = true;
    videoRef.current?.pause();
    setNotice(message);
  }

  async function begin() {
    if (!viewer || startingRef.current || sessionIdRef.current) return;
    startingRef.current = true;
    try {
      const result = await startSession(viewer, video.id);
      if ("sessionId" in result) {
        sessionIdRef.current = result.sessionId;
        stepsSentRef.current = 0;
        void pump();
      } else if (result.error === "no-balance") {
        pauseWith(ADD_FUNDS);
      } else if (result.error === "withdrawal") {
        pauseWith("Your balance is being withdrawn, so playback is paused.");
      } else {
        pauseWith("We couldn't start playback. Press play to try again.");
      }
    } catch {
      pauseWith("We couldn't start playback. Press play to try again.");
    } finally {
      startingRef.current = false;
    }
  }

  function handleStop(reason: string) {
    if (reason === "insufficient balance") return pauseWith(ADD_FUNDS);

    if (/^session is |^unknown session/.test(reason)) {
      // The backend already closed this session and charged its last receipt.
      // Keep that in the total and carry on in a fresh session.
      earlierPaidRef.current = billedSoFar();
      sessionIdRef.current = null;
      stepsSentRef.current = 0;
      sessionBaseRef.current = watchedRef.current;
      if (!videoRef.current?.paused) void begin();
      return;
    }

    pauseWith("Payments paused. Press play to try again.");
  }

  // Sends one receipt for each finished 10-second step, in order, one at a time.
  async function pump() {
    const sessionId = sessionIdRef.current;
    if (!viewer || !sessionId || busyRef.current || stoppedRef.current) return;
    busyRef.current = true;
    try {
      while (sessionIdRef.current === sessionId && !stoppedRef.current) {
        const due = Math.floor((watchedRef.current - sessionBaseRef.current) / STEP_SECONDS);
        if (due <= stepsSentRef.current) break;

        const amount = BigInt(stepsSentRef.current + 1) * PRICE_STEP;
        const reply = await sendHeartbeat(sessionId, viewer, amount);
        if (sessionIdRef.current !== sessionId) break; // ended while we waited
        if (reply.ok) {
          stepsSentRef.current += 1;
        } else {
          handleStop(reply.reason);
          break;
        }
      }
    } catch {
      // Network hiccup: the next timeupdate tries again.
    } finally {
      busyRef.current = false;
    }
  }

  function handlePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (phaseRef.current !== "watching") {
      // A new viewing: start every counter from zero.
      phaseRef.current = "watching";
      setPhase("watching");
      watchedRef.current = 0;
      sessionBaseRef.current = 0;
      stepsSentRef.current = 0;
      earlierPaidRef.current = 0n;
      sessionIdRef.current = null;
      setThisVideo(0n);
      setSummary(null);
    }
    stoppedRef.current = false;
    setNotice(null);
    lastTimeRef.current = v.currentTime;
    void begin();
    void pump();
  }

  // Counts only real playback: skips paused or seeking moments, and any jump
  // too big to be normal playback (a seek between two timeupdate events).
  function handleTimeUpdate() {
    const v = videoRef.current;
    if (!v) return;
    const last = lastTimeRef.current;
    lastTimeRef.current = v.currentTime;
    if (last === null || v.paused || v.seeking || stoppedRef.current || phaseRef.current !== "watching") return;

    const delta = v.currentTime - last;
    if (delta > 0 && delta < 1.5) {
      watchedRef.current += delta;
      void pump();
    }
  }

  function handleSeeked() {
    lastTimeRef.current = videoRef.current?.currentTime ?? null;
  }

  /** Stops billing, settles the session and returns what the viewer paid. */
  async function finish(): Promise<Summary | null> {
    if (phaseRef.current !== "watching") return null;
    phaseRef.current = "ended";
    setPhase("ended");
    videoRef.current?.pause();

    // Let a receipt that's already on its way arrive first (up to 3 seconds).
    for (let i = 0; i < 60 && busyRef.current; i++) await sleep(50);

    const sessionId = sessionIdRef.current;
    sessionIdRef.current = null;
    const watchedSeconds = Math.floor(watchedRef.current);
    let result: Summary;
    if (!sessionId) {
      result = { watchedSeconds, paid: earlierPaidRef.current };
    } else {
      try {
        const ended = await endSession(sessionId, watchedRef.current - sessionBaseRef.current);
        result = { watchedSeconds, paid: earlierPaidRef.current + ended.charged, link: ended.link };
      } catch {
        // The backend settles idle sessions by itself, so show what it will charge.
        result = { watchedSeconds, paid: billedSoFar() };
      }
    }

    setSummary(result);
    setNotice(null);
    refreshBalance().catch(() => {});
    loadMonth().catch(() => {});
    return result;
  }

  // Live meter: refresh the overlay numbers every second.
  useEffect(() => {
    const id = setInterval(() => setThisVideo(billedSoFar()), 1000);
    return () => clearInterval(id);
  }, []);

  // While paused, re-send the latest receipt every 30s so the backend doesn't auto-settle.
  const keepAlive = useEffectEvent(() => {
    const sessionId = sessionIdRef.current;
    if (!viewer || !sessionId || busyRef.current || stepsSentRef.current === 0) return;
    if (phaseRef.current !== "watching") return;
    busyRef.current = true;
    sendHeartbeat(sessionId, viewer, BigInt(stepsSentRef.current) * PRICE_STEP)
      .then((reply) => {
        if (!reply.ok && sessionIdRef.current === sessionId) handleStop(reply.reason);
      })
      .catch(() => {})
      .finally(() => {
        busyRef.current = false;
      });
  });
  useEffect(() => {
    const id = setInterval(keepAlive, KEEPALIVE_MS);
    return () => clearInterval(id);
  }, []);

  // Closing the tab: a beacon still reaches the backend after the page is gone.
  const onPageHide = useEffectEvent(() => {
    if (phaseRef.current === "watching" && sessionIdRef.current) {
      endSessionOnUnload(sessionIdRef.current, watchedRef.current - sessionBaseRef.current);
    }
  });
  useEffect(() => {
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  // Navigating away: Next.js hides this page instead of removing it, and a hidden
  // <video> keeps playing, so pause it here and settle. The library shows the summary.
  const onLeave = useEffectEvent(() => {
    finish()
      .then((result) => {
        if (result) setLastSummary(result);
      })
      .catch(() => {});
  });
  useLayoutEffect(() => {
    const v = videoRef.current;
    return () => {
      v?.pause();
      onLeave();
    };
  }, []);

  const cap = month?.cap ?? 0n;
  const spent = month?.spent ?? 0n;
  const capLeft = cap > spent ? cap - spent : 0n;
  const videoCost = thisVideo < capLeft ? thisVideo : capLeft;
  const monthTotal = spent + videoCost;
  const capReached = month !== null && monthTotal >= cap;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/library" className="text-sm text-zinc-500">
          ← Library
        </Link>
        {phase === "watching" && (
          <button
            className="rounded-full bg-black px-4 py-1.5 text-sm text-white dark:bg-white dark:text-black"
            onClick={() => void finish()}
          >
            Done
          </button>
        )}
      </div>

      <div className="relative overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef}
          src={video.src}
          poster={video.thumbnail}
          controls
          playsInline
          preload="metadata"
          className="aspect-video w-full"
          onPlay={handlePlay}
          onTimeUpdate={handleTimeUpdate}
          onSeeked={handleSeeked}
        />
        {phase === "watching" && month && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs text-white">
            {formatDollars(videoCost)} this video · {formatDollars(monthTotal)} of {formatDollars(cap)} this month
          </div>
        )}
      </div>

      {notice && <p className="text-red-600">{notice}</p>}
      {capReached && <p className="text-green-700 dark:text-green-400">You’ve hit this month’s cap — the rest of the month is free.</p>}
      {phase === "ended" && (summary ? <SummaryLine summary={summary} /> : <p className="text-sm">Finishing up…</p>)}

      <div>
        <h1 className="text-xl font-semibold">{video.title}</h1>
        <p className="text-xs text-zinc-500">{video.credit}</p>
      </div>
    </div>
  );
}
