"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../session";
import { Sidebar } from "./sidebar";

// Wraps every signed-in page: sends signed-out visitors to the login page and shows the sidebar.
export default function SignedInLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { identity } = useSession();

  useEffect(() => {
    if (!identity) router.replace("/");
  }, [identity, router]);

  if (!identity) return null;

  return (
    <div className="flex w-full flex-1 flex-col lg:flex-row">
      <Sidebar />
      <main className="min-w-0 flex-1 p-6 lg:p-8">{children}</main>
    </div>
  );
}
