import Link from "next/link";
import { formatDollars } from "@/lib/account";
import { PRICE_PER_MINUTE } from "@/lib/playback";
import { videos } from "@/lib/videos";
import { LastSummary } from "./last-summary";

function formatLength(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function LibraryPage() {
  return (
    <div className="space-y-4">
      <LastSummary />
      <h1 className="text-2xl font-semibold">Library</h1>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((video) => (
          <li key={video.id}>
            <Link href={`/watch/${video.id}`} className="group block space-y-2">
              {/* Background image so a missing thumbnail just shows the grey box. */}
              <div
                className="aspect-video rounded-lg bg-zinc-200 bg-cover bg-center group-hover:opacity-90 dark:bg-zinc-800"
                style={{ backgroundImage: `url(${video.thumbnail})` }}
              />
              <p className="font-medium">{video.title}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {formatLength(video.duration)} · {formatDollars(PRICE_PER_MINUTE)}/min
              </p>
              <p className="text-xs text-zinc-500">{video.credit}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
