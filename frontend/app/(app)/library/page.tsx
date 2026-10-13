"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Play, User } from "lucide-react";
import { formatDollars, getAccount, getViewings, type AccountInfo, type Viewing } from "@/lib/account";
import { formatWatched, fullFilmPrice, PRICE_PER_MINUTE } from "@/lib/playback";
import { categories, getVideo, videos, type Category } from "@/lib/videos";
import { useSession } from "../../session";
import { CapProgress } from "../cap-progress";
import { LastSummary } from "./last-summary";

const PER_MINUTE = `${formatDollars(PRICE_PER_MINUTE)}/min`;

function formatLength(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function LibraryPage() {
  const { identity } = useSession();
  const viewer = identity?.viewer;
  const [filter, setFilter] = useState<Category | "All">("All");
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [viewings, setViewings] = useState<Viewing[] | null>(null);

  useEffect(() => {
    if (!viewer) return;
    let active = true;
    Promise.all([getAccount(viewer), getViewings(viewer)])
      .then(([info, list]) => {
        if (!active) return;
        setAccount(info);
        setViewings(list);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [viewer]);

  const hero = videos[0];
  const shown = filter === "All" ? videos : videos.filter((v) => v.category === filter);
  const capLeft = account
    ? account.monthlyCap > account.monthlySpent
      ? account.monthlyCap - account.monthlySpent
      : 0n
    : undefined;

  return (
    <div className="flex flex-col gap-8 xl:flex-row">
      <div className="min-w-0 flex-1 space-y-8">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-2">
            {(["All", ...categories] as const).map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  filter === c ? "border-fg bg-fg text-black" : "border-line text-muted hover:text-fg"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <div aria-label="Your profile" className="grid h-9 w-9 place-items-center rounded-full border border-line bg-raised text-muted">
            <User size={18} strokeWidth={1.5} />
          </div>
        </div>

        <LastSummary capReached={capLeft === 0n} />

        {/* Hero: the artwork carries the colour; the fade is only for legible text. */}
        <section className="relative overflow-hidden rounded-lg border border-line bg-surface">
          <div
            className="aspect-[21/9] min-h-72 w-full bg-cover bg-center"
            style={{ backgroundImage: `url(${hero.thumbnail})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 max-w-xl space-y-4 p-8">
            <div className="flex gap-2">
              {hero.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-white/20 px-2.5 py-0.5 text-xs text-fg/90">
                  {tag}
                </span>
              ))}
            </div>
            <h1 className="page-title">{hero.title}</h1>
            <p className="leading-relaxed text-fg/80">{hero.description}</p>
            <div className="flex items-center gap-4">
              <Link href={`/watch/${hero.id}`} className="btn-primary px-4 py-2">
                <Play size={18} strokeWidth={1.5} fill="currentColor" />
                Watch · <span className="tabular-nums">{PER_MINUTE}</span>
              </Link>
              <span className="text-xs text-fg/60">{hero.credit}</span>
            </div>
          </div>
        </section>

        {/* Watch now */}
        <section id="watch-now" className="scroll-mt-8 space-y-4">
          <h2 className="section-title">Watch now</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((video) => (
              <Link key={video.id} href={`/watch/${video.id}`} className="group space-y-3">
                <div className="overflow-hidden rounded-lg border border-line bg-surface">
                  <div
                    className="aspect-video bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
                    style={{ backgroundImage: `url(${video.thumbnail})` }}
                  />
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate font-medium">{video.title}</p>
                    <p className="text-xs text-muted tabular-nums">
                      {formatLength(video.duration)} · {PER_MINUTE}
                    </p>
                    <p className="text-xs text-muted">
                      Full film: up to{" "}
                      <span className="text-fg tabular-nums">
                        {formatDollars(fullFilmPrice(video.duration, capLeft))}
                      </span>
                    </p>
                    <p className="text-xs text-faint">{video.credit}</p>
                  </div>
                  <span className="btn-secondary h-8 w-8 shrink-0 group-hover:bg-raised">
                    <Play size={18} strokeWidth={1.5} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* Right panel */}
      <aside className="flex shrink-0 flex-col gap-6 xl:w-72">
        <div className="panel space-y-3 p-4">
          <h2 className="font-semibold">This month</h2>
          {account ? (
            <CapProgress spent={account.monthlySpent} cap={account.monthlyCap} />
          ) : (
            <p className="text-faint">Loading…</p>
          )}
        </div>

        <div className="panel space-y-4 p-4">
          <h2 className="font-semibold">Recently watched</h2>
          {viewings === null && <p className="text-faint">Loading…</p>}
          {viewings?.length === 0 && <p className="text-faint">Nothing watched yet.</p>}
          <ul className="space-y-3">
            {viewings?.slice(0, 5).map((v) => {
              const video = getVideo(v.videoId);
              return (
                <li key={v.sessionId} className="flex items-center gap-3">
                  <div
                    className="h-9 w-16 shrink-0 rounded-md bg-raised bg-cover bg-center"
                    style={video ? { backgroundImage: `url(${video.thumbnail})` } : undefined}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{video?.title ?? "Video"}</p>
                    <p className="text-xs text-muted tabular-nums">{formatWatched(v.watchedSeconds)}</p>
                  </div>
                  <p className="tabular-nums">
                    {v.status === "settled" || v.status === "closed" ? (
                      formatDollars(v.charged ?? 0n)
                    ) : (
                      <span className="text-faint">Pending</span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </div>
  );
}
