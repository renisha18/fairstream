"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Hex } from "viem";
import { formatDollars, getAccount } from "@/lib/account";
import {
  endSession,
  endSessionOnUnload,
  fullFilmPrice,
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

  // Display only: the cost pill behaves like player controls. Hidden while the film plays,
  // shown when paused or for 3 seconds after the pointer moves over the player.
  const [paused, setPaused] = useState(true);
  const [pointerActive, setPointerActive] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showControlsBriefly() {
    setPointerActive(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setPointerActive(false), 3000);
  }

  function hideControls() {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setPointerActive(false);
  }

  useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    },
    [],
  );

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
  // After "Done" the month total already includes this video, so compare it directly.
  const capReachedAfter = month !== null && month.spent >= month.cap;
  const meterVisible = paused || pointerActive;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/library" className="inline-flex items-center gap-2 text-muted hover:text-fg">
          <ArrowLeft size={18} strokeWidth={1.5} />
          Library
        </Link>
        {phase === "watching" && (
          <button className="btn-primary px-4 py-1.5" onClick={() => void finish()}>
            Done
          </button>
        )}
      </div>

      <div
        className="relative overflow-hidden rounded-lg border border-line bg-black"
        onPointerMove={showControlsBriefly}
        onPointerDown={showControlsBriefly}
        onPointerLeave={hideControls}
      >
        <video
          ref={videoRef}
          src={video.src}
          poster={video.thumbnail}
          controls
          playsInline
          preload="metadata"
          className="aspect-video w-full"
          onPlay={() => {
            setPaused(false);
            handlePlay();
          }}
          onPause={() => setPaused(true)}
          onEnded={() => setPaused(true)}
          onTimeUpdate={handleTimeUpdate}
          onSeeked={handleSeeked}
        />
        {phase === "ready" && (
          <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
            Full film: up to{" "}
            <span className="text-fg tabular-nums">
              {formatDollars(fullFilmPrice(video.duration, month ? capLeft : undefined))}
            </span>
          </div>
        )}
        {phase === "watching" && month && (
          <div
            aria-hidden={!meterVisible}
            className={`pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs tabular-nums transition-opacity duration-200 ${
              meterVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-money" />
            <span className="text-money">{formatDollars(videoCost)} this video</span>
            <span className="text-muted">
              · {formatDollars(monthTotal)} of {formatDollars(cap)} this month
            </span>
          </div>
        )}
      </div>

      {notice && <p className="panel px-4 py-3">{notice}</p>}
      {capReached && phase !== "ended" && (
        <p className="panel px-4 py-3 text-money">You’ve reached this month’s cap. Everything else this month is free.</p>
      )}
      {phase === "ended" && (
        <div className="panel space-y-1 px-4 py-4">
          <p className="label">Summary</p>
          {summary ? (
            <SummaryLine summary={summary} capReached={capReachedAfter} />
          ) : (
            <p className="text-muted">Finishing up…</p>
          )}
        </div>
      )}

      <div className="space-y-3">
        <h1 className="page-title">{video.title}</h1>
        <div className="flex flex-wrap gap-2">
          {video.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">
              {tag}
            </span>
          ))}
        </div>
        <p className="max-w-2xl leading-relaxed text-muted">{video.description}</p>
        <p className="label text-faint">{video.credit}</p>
      </div>
    </div>
  );
}
