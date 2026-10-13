"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../session";
import { Header } from "./header";

// Wraps every signed-in page: sends signed-out visitors to the login page and shows the header.
export default function SignedInLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { identity } = useSession();

  useEffect(() => {
    if (!identity) router.replace("/");
  }, [identity, router]);

  if (!identity) return null;

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 p-6">{children}</main>
    </>
  );
}
