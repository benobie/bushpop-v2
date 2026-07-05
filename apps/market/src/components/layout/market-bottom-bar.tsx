"use client";

import { usePathname } from "next/navigation";
import { MobileBottomBar, HouseIcon, SearchIcon, PlusCircleIcon, UserIcon } from "@bushpop/ui";

/**
 * Active-tab-aware wrapper — @bushpop/ui's MobileBottomBar is presentational
 * only (no router awareness), so path-based highlighting lives here.
 */
export function MarketBottomBar() {
  const pathname = usePathname();

  const items = [
    { key: "home", label: "Home", href: "/", icon: <HouseIcon size={22} />, active: pathname === "/" },
    {
      key: "search",
      label: "Search",
      href: "/search",
      icon: <SearchIcon size={22} />,
      active: pathname.startsWith("/search") || pathname.startsWith("/browse"),
    },
    { key: "sell", label: "Sell", href: "/sell", icon: <PlusCircleIcon size={22} />, active: pathname.startsWith("/sell") },
    { key: "account", label: "Account", href: "/account", icon: <UserIcon size={22} />, active: pathname.startsWith("/account") },
  ];

  return <MobileBottomBar items={items} />;
}
