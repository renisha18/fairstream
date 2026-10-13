"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, LayoutGrid, User } from "lucide-react";
import { addFunds, formatDollars } from "@/lib/account";
import { friendlyError } from "@/lib/passkey";
import { useSession } from "../session";
import { Logo } from "../logo";

const NAV = [
  { href: "/library", label: "Home", Icon: House },
  { href: "/library#watch-now", label: "Library", Icon: LayoutGrid },
  { href: "/account", label: "Account", Icon: User },
];

// Left sidebar on laptop screens, a top bar on phones. Holds the balance and "Add $5".
export function Sidebar() {
  const pathname = usePathname();
  const { identity, balance, refreshBalance } = useSession();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    refreshBalance().catch(() => setError("Couldn't load your balance."));
  }, [refreshBalance]);

  async function handleAddFunds() {
    if (!identity) return;
    setAdding(true);
    setError(null);
    try {
      await addFunds(identity.viewer, identity.meterKey);
      await refreshBalance();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setAdding(false);
    }
  }

  return (
    <aside className="flex shrink-0 flex-col gap-8 border-line bg-surface p-4 max-lg:border-b lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:border-r">
      <Link href="/library" className="px-2 pt-2">
        <Logo />
      </Link>

      <nav className="flex gap-1 lg:flex-col">
        {NAV.map(({ href, label, Icon }) => {
          const active = href === pathname;
          return (
            <Link
              key={label}
              href={href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 transition-colors ${
                active ? "bg-raised text-fg" : "text-muted hover:bg-raised hover:text-fg"
              }`}
            >
              <Icon size={18} strokeWidth={1.5} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 border-t border-line pt-4">
        <p className="label px-1">Balance</p>
        <p className="px-1 text-2xl font-semibold tracking-tight tabular-nums">
          {adding ? <span className="text-sm font-normal text-muted">Adding funds…</span> : balance === null ? "—" : formatDollars(balance)}
        </p>
        <button className="btn-primary w-full py-2" disabled={adding} onClick={handleAddFunds}>
          Add $5
        </button>
        {error && <p className="px-1 text-xs text-muted">{error}</p>}
      </div>
    </aside>
  );
}
