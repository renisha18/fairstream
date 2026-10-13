"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { hasSavedPasskey } from "@/lib/passkey";
import { useSession } from "../session";
import { Sidebar } from "./sidebar";
import { WelcomeBack } from "./welcome-back";

function subscribeToStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

// Wraps every signed-in page. Not signed in (e.g. after a reload): a returning viewer gets
// the "Welcome back" prompt right here, anyone else is sent to the login page.
export default function SignedInLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { identity } = useSession();
  // null while rendering on the server, where localStorage doesn't exist.
  const returning = useSyncExternalStore(subscribeToStorage, hasSavedPasskey, () => null);

  useEffect(() => {
    if (!identity && returning === false) router.replace("/");
  }, [identity, returning, router]);

  if (!identity) return returning ? <WelcomeBack /> : null;

  return (
    <div className="flex w-full flex-1 flex-col lg:flex-row">
      <Sidebar />
      <main className="min-w-0 flex-1 p-6 lg:p-8">{children}</main>
    </div>
  );
}
