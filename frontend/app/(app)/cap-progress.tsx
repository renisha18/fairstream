import { formatDollars } from "@/lib/account";
import { formatResetDay, usePeriodEnd } from "@/lib/period";

// The cap for the current 30-day period, shown as progress towards "free", not as money spent.
export function CapProgress({ spent, cap }: { spent: bigint; cap: bigint }) {
  const left = cap > spent ? cap - spent : 0n;
  const percent = cap > 0n ? Math.min(100, Number((spent * 100n) / cap)) : 0;
  const periodEnd = usePeriodEnd();

  return (
    <div className="space-y-3">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
        <div className="h-full rounded-full bg-money" style={{ width: `${percent}%` }} />
      </div>
      {left > 0n ? (
        <p className="text-muted">
          <span className="text-fg tabular-nums">{formatDollars(left)}</span> until{" "}
          <span className="text-money">free for the rest of this period</span>
        </p>
      ) : (
        <p className="text-money">
          {periodEnd ? `Free until ${formatResetDay(periodEnd)}` : "Free for the rest of this period"}
        </p>
      )}
      {periodEnd && <p className="label text-faint">Resets on {formatResetDay(periodEnd)}</p>}
    </div>
  );
}
