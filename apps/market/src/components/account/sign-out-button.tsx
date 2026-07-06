"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { broadcastSignOut } from "@/providers/session-provider";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();

  async function handleClick() {
    await signOut();
    broadcastSignOut();
    router.refresh();
    router.push("/");
  }

  return (
    <button type="button" onClick={handleClick} className={className}>
      Sign out
    </button>
  );
}
