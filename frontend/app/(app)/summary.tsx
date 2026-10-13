import { formatDollars } from "@/lib/account";
import { formatWatched, MONTHLY_PLAN_PRICE, savedVsPlan, type Summary } from "@/lib/playback";

export function SummaryLine({ summary, capReached = false }: { summary: Summary; capReached?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-muted">
        You watched <span className="text-fg tabular-nums">{formatWatched(summary.watchedSeconds)}</span> · paid{" "}
        <span className="text-fg tabular-nums">{formatDollars(summary.paid)}</span>
        {!capReached && (
          <>
            {" "}
            · saved <span className="text-fg tabular-nums">{formatDollars(savedVsPlan(summary.paid))}</span> compared
            with a <span className="tabular-nums">{formatDollars(MONTHLY_PLAN_PRICE)}</span> monthly plan.
          </>
        )}
        {summary.link && (
          <>
            {" "}
            <a href={summary.link} target="_blank" rel="noreferrer" className="text-xs underline underline-offset-4 hover:text-fg">
              View receipt
            </a>
          </>
        )}
      </p>
      {capReached && <p className="text-money">You’ve reached this month’s cap. Everything else this month is free.</p>}
    </div>
  );
}
