"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createTabSync } from "@/lib/tab-sync";

const tabSync = typeof window !== "undefined" ? createTabSync("auth") : null;

interface SessionProviderProps {
  children: React.ReactNode;
}

/**
 * Session context provider with cross-tab sign-out sync. (FM-2, FM-10)
 *
 * Listens for sign-out messages from other tabs and redirects to /sign-in.
 * Also re-checks auth state when a tab becomes visible (Safari workaround).
 */
export function SessionProvider({ children }: SessionProviderProps) {
  const router = useRouter();

  useEffect(() => {
    if (!tabSync) return;

    tabSync.onMessage((msg) => {
      if (
        typeof msg === "object" &&
        msg !== null &&
        "type" in msg
      ) {
        const { type } = msg as { type: string };
        if (type === "sign-out") {
          router.refresh();
          router.push("/sign-in");
        }
        if (type === "visibility-check") {
          // Re-fetch RSC to check if session is still valid
          router.refresh();
        }
      }
    });
  }, [router]);

  return <>{children}</>;
}

/** Broadcast sign-out to other tabs */
export function broadcastSignOut() {
  tabSync?.postMessage({ type: "sign-out" });
}
