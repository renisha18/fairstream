"use client";

import { useSession } from "../../session";
import { SummaryLine } from "../summary";

// Shows what the last video cost when the viewer left it by navigating here.
export function LastSummary() {
  const { lastSummary, setLastSummary } = useSession();
  if (!lastSummary) return null;

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-zinc-100 px-4 py-3 dark:bg-zinc-900">
      <SummaryLine summary={lastSummary} />
      <button className="text-sm text-zinc-500" onClick={() => setLastSummary(null)}>
        Dismiss
      </button>
    </div>
  );
}
