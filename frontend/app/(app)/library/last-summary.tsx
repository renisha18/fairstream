"use client";

import { X } from "lucide-react";
import { useSession } from "../../session";
import { SummaryLine } from "../summary";

// Shows what the last video cost when the viewer left it by navigating here.
export function LastSummary({ capReached }: { capReached: boolean }) {
  const { lastSummary, setLastSummary } = useSession();
  if (!lastSummary) return null;

  return (
    <div className="panel flex items-start justify-between gap-4 px-4 py-3">
      <SummaryLine summary={lastSummary} capReached={capReached} />
      <button aria-label="Dismiss" className="text-faint hover:text-fg" onClick={() => setLastSummary(null)}>
        <X size={18} strokeWidth={1.5} />
      </button>
    </div>
  );
}
