// Mobile bottom bar — fixed tab bar shown only on small screens. Pure RSC
// (plain links). Marketplace tabs route to the "Launching soon" storefront.
import Link from "next/link";
import { Search, Heart, PlusCircle, ShoppingBag } from "lucide-react";
import { COMING_SOON, SELL_SOON, BAG_SOON } from "@/lib/links";

const TABS = [
  { href: COMING_SOON, label: "Search", Icon: Search },
  { href: COMING_SOON, label: "Saved", Icon: Heart },
  { href: SELL_SOON, label: "Sell", Icon: PlusCircle, accent: true },
  { href: BAG_SOON, label: "Bag", Icon: ShoppingBag },
];

export function MobileBottomBar() {
  return (
    <nav
      aria-label="Mobile"
      className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-around border-t border-line bg-white/90 px-2 py-2 backdrop-blur-lg md:hidden"
    >
      {TABS.map(({ href, label, Icon, accent }) => (
        <Link
          key={label}
          href={href}
          className={`flex flex-col items-center gap-1 text-[11px] font-medium ${
            accent ? "text-green-ink" : "text-ink-2"
          }`}
        >
          <Icon size={20} strokeWidth={2} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
