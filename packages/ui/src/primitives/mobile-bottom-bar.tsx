import * as React from "react";
import { HouseIcon, SearchIcon, PlusCircleIcon, UserIcon } from "../icons/nav-icons";
import { cn } from "../lib/cn";

export interface MobileBottomBarItem {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  active?: boolean;
}

export interface MobileBottomBarProps extends React.HTMLAttributes<HTMLElement> {
  items?: MobileBottomBarItem[];
}

const defaultItems = (): MobileBottomBarItem[] => [
  { key: "home", label: "Home", href: "/", icon: <HouseIcon size={22} /> },
  { key: "search", label: "Search", href: "/search", icon: <SearchIcon size={22} /> },
  { key: "sell", label: "Sell", href: "/sell", icon: <PlusCircleIcon size={22} /> },
  { key: "account", label: "Account", href: "/account", icon: <UserIcon size={22} /> },
];

/** Mobile bottom tab bar — new (the prototype relies on the drawer for mobile chrome). Same Lit Glass language: flat at rest, active tab lights BRG. */
function MobileBottomBar({ className, items = defaultItems(), ...props }: MobileBottomBarProps) {
  return (
    <nav className={cn("bp-bottombar", className)} {...props}>
      <div className="bp-bottombar-inner">
        {items.map((item) => (
          <a key={item.key} href={item.href} className={cn(item.active && "bp-active")} aria-current={item.active ? "page" : undefined}>
            {item.icon}
            <span>{item.label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}

export { MobileBottomBar };
