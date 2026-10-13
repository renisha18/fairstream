import { formatDollars } from "@/lib/account";
import { formatWatched, type Summary } from "@/lib/playback";

export function SummaryLine({ summary }: { summary: Summary }) {
  return (
    <p className="text-sm">
      You watched {formatWatched(summary.watchedSeconds)} · paid {formatDollars(summary.paid)}
      {summary.link && (
        <>
          {" · "}
          <a href={summary.link} target="_blank" rel="noreferrer" className="text-xs underline">
            View receipt
          </a>
        </>
      )}
    </p>
  );
}
