"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { SiteNav, type SiteNavProps } from "@bushpop/ui";
import { signOut } from "@/lib/auth-client";
import { broadcastSignOut } from "@/providers/session-provider";
import { formatMoney } from "@/lib/format-money";

type SiteNavClientProps = Omit<SiteNavProps, "onLogout" | "LinkComponent" | "formatBagTotal">;

/**
 * Client boundary for SiteNav — the nav itself needs hooks (scroll listener,
 * drawer state), and logout needs a browser-side auth-client call, so this
 * wraps @bushpop/ui's SiteNav with Bushpop's own Link + sign-out wiring.
 * Session/cart data are fetched server-side by SiteHeader and passed down
 * as plain props — this component owns no data fetching of its own.
 */
export function SiteNavClient(props: SiteNavClientProps) {
  const router = useRouter();

  async function handleLogout() {
    await signOut();
    broadcastSignOut();
    router.refresh();
    router.push("/");
  }

  return (
    <SiteNav
      {...props}
      onLogout={handleLogout}
      formatBagTotal={(cents) => formatMoney(cents)}
      LinkComponent={Link}
    />
  );
}
