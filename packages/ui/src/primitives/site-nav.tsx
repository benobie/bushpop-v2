"use client";

import * as React from "react";
import {
  MenuIcon,
  CloseIcon,
  ChevronDownIcon,
  SearchIcon,
  HeartIcon,
  ChatIcon,
  PlusCircleIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  BagOutlineIcon,
  BagFillIcon,
} from "../icons/nav-icons";
import { cn } from "../lib/cn";
import { useCursorLight } from "../lib/use-cursor-light";
import { useNavScrolled } from "../lib/use-nav-scrolled";

export interface NavCategory {
  key: string;
  label: string;
  /** e.g. "Women's categories" */
  drawerTitle: string;
  seeAllLabel: string;
  seeAllHref: string;
  newHref: string;
  trendingHref: string;
  saleHref: string;
  subs: Array<{ label: string; href: string }>;
  terms: Array<{ label: string; href: string }>;
}

type LinkComponent = React.ForwardRefExoticComponent<
  React.AnchorHTMLAttributes<HTMLAnchorElement> &
    { href: string } &
    React.RefAttributes<HTMLAnchorElement>
>;

const DefaultLink: LinkComponent = React.forwardRef<
  HTMLAnchorElement,
  React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }
>(({ href, ...props }, ref) => <a ref={ref} href={href} {...props} />);
DefaultLink.displayName = "DefaultLink";

export interface SiteNavProps {
  logo: React.ReactNode;
  homeHref?: string;
  searchHref?: string;
  searchPlaceholder?: string;
  sellHref?: string;
  auth: boolean;
  onLogout?: () => void;
  signInHref?: string;
  signUpHref?: string;
  savedHref?: string;
  messagesHref?: string;
  accountHref?: string;
  dashboardHref?: string;
  ordersHref?: string;
  helpHref?: string;
  bagHref?: string;
  bagTotal?: number;
  bagCount?: number;
  formatBagTotal?: (total: number) => string;
  /** A/B: mobile visitor CTA (Ben 03/07) — default = A (signup). Not settled; instrument at launch. */
  mobileCta?: "signup" | "sell";
  categories?: NavCategory[];
  LinkComponent?: LinkComponent;
  className?: string;
}

const defaultFormatBagTotal = (n: number) => `$${n.toFixed(2)}`;

function NavRow({
  href,
  label,
  icon,
  sale,
  Link,
  onClick,
}: {
  href: string;
  label: string;
  icon?: React.ReactNode;
  sale?: boolean;
  Link: LinkComponent;
  onClick?: () => void;
}) {
  const lightRef = useCursorLight<HTMLAnchorElement>();
  return (
    <Link ref={lightRef} href={href} className={cn(sale && "bp-sale")} onClick={onClick}>
      <span>{label}</span>
      {icon}
    </Link>
  );
}

/**
 * Global shared nav — spec LOCKED (HANDOFF-nav.md). Logo · centred search
 * pill · right group (four states) · borderless until ~8px scroll · ≤900px
 * burger + two-level drawer. Session/data-driven: auth/bag come from props,
 * not hardcoded fixtures (the prototype's `_nav.js` NAV object).
 */
function SiteNav({
  logo,
  homeHref = "/",
  searchHref = "/search",
  searchPlaceholder = "Search brands, items, sizes…",
  sellHref = "/sell",
  auth,
  onLogout,
  signInHref = "/sign-in",
  signUpHref = "/sign-up",
  savedHref = "/saved",
  messagesHref = "/messages",
  accountHref = "/account",
  dashboardHref = "/dashboard",
  ordersHref = "/orders",
  helpHref = "/help",
  bagHref = "/bag",
  bagTotal = 0,
  bagCount = 0,
  formatBagTotal = defaultFormatBagTotal,
  mobileCta = "signup",
  categories = [],
  LinkComponent: Link = DefaultLink,
  className,
}: SiteNavProps) {
  const scrolled = useNavScrolled(8);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerLevel, setDrawerLevel] = React.useState<{ key: string } | null>(null);
  const bagLightRef = useCursorLight<HTMLAnchorElement>();

  const closeDrawer = React.useCallback(() => {
    setDrawerOpen(false);
    setDrawerLevel(null);
  }, []);

  React.useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [drawerOpen, closeDrawer]);

  const bag = (
    <Link ref={bagLightRef} href={bagHref} className="bp-baglink" aria-label="Bag">
      {bagTotal > 0 && <span className="bp-bagtot bp-nav-dt">{formatBagTotal(bagTotal)}</span>}
      <span className="bp-nav-ic bp-bagic">
        <BagFillIcon size={22} className="bp-bag-fill" />
        <BagOutlineIcon size={22} className="bp-bag-outline" />
        {bagCount > 0 && <span className="bp-bct">{bagCount}</span>}
      </span>
    </Link>
  );

  const sell = (
    <Link href={sellHref} className="bp-btn bp-btn-green bp-btn-sm bp-nav-dt">
      Sell <PlusCircleIcon size={16} className="bp-pic" />
    </Link>
  );

  return (
    <>
      <nav className={cn("bp-nav", scrolled && "bp-nav-scrolled", className)}>
        <div className="bp-nav-inner">
          <button
            type="button"
            className="bp-burger"
            aria-label="Menu"
            onClick={() => setDrawerOpen(true)}
          >
            <MenuIcon size={22} />
          </button>
          <Link href={homeHref} aria-label="Bushpop home">
            {logo}
          </Link>
          <Link href={searchHref} className="bp-nav-search">
            <SearchIcon size={16} />
            {searchPlaceholder}
          </Link>
          <div className="bp-nav-right">
            {auth ? (
              <>
                <Link href={savedHref} className="bp-nav-ic bp-nav-dt" aria-label="Saved">
                  <HeartIcon size={20} />
                </Link>
                <Link href={messagesHref} className="bp-nav-ic bp-nav-dt" aria-label="Messages">
                  <ChatIcon size={20} />
                </Link>
                {sell}
                <button
                  type="button"
                  className="bp-acct bp-nav-dt"
                  onClick={onLogout}
                  aria-label="Account · log out"
                >
                  <span className="bp-acct-av" />
                  <ChevronDownIcon size={14} />
                </button>
                <Link href={searchHref} className="bp-nav-ic bp-nav-mb" aria-label="Search">
                  <SearchIcon size={20} />
                </Link>
                <Link href={messagesHref} className="bp-nav-ic bp-nav-mb" aria-label="Messages">
                  <ChatIcon size={20} />
                </Link>
                <Link href={savedHref} className="bp-nav-ic bp-nav-mb" aria-label="Saved">
                  <HeartIcon size={20} />
                </Link>
                {bag}
              </>
            ) : (
              <>
                {sell}
                <Link href={signUpHref} className="bp-btn bp-btn-ghost bp-btn-sm bp-nav-dt">
                  Sign up
                </Link>
                <Link href={signInHref} className="bp-btn bp-btn-olite bp-btn-sm bp-nav-dt">
                  Log in
                </Link>
                <Link href={searchHref} className="bp-nav-ic bp-nav-mb" aria-label="Search">
                  <SearchIcon size={20} />
                </Link>
                {mobileCta === "sell" ? (
                  <Link href={sellHref} className="bp-btn bp-btn-green bp-btn-sm bp-nav-mb">
                    Sell <PlusCircleIcon size={16} />
                  </Link>
                ) : (
                  <Link href={signUpHref} className="bp-btn bp-btn-dark bp-btn-sm bp-nav-mb">
                    Sign up
                  </Link>
                )}
                {bag}
              </>
            )}
          </div>
        </div>
      </nav>

      <div className={cn("bp-drawer", drawerOpen && "bp-drawer-open")}>
        <div className="bp-drawer-scrim" onClick={closeDrawer} />
        <div className="bp-drawer-panel" role="dialog" aria-label="Menu" aria-hidden={!drawerOpen}>
          {drawerLevel ? (
            (() => {
              const cat = categories.find((c) => c.key === drawerLevel.key);
              if (!cat) return null;
              return (
                <>
                  <div className="bp-drawer-head">
                    <button type="button" aria-label="Back" onClick={() => setDrawerLevel(null)}>
                      <ArrowLeftIcon size={20} />
                    </button>
                    <button type="button" aria-label="Close" onClick={closeDrawer}>
                      <CloseIcon size={20} />
                    </button>
                  </div>
                  <div className="bp-drawer-title">{cat.drawerTitle}</div>
                  <nav className="bp-drawer-list">
                    <Link href={cat.newHref} onClick={closeDrawer}>
                      <span>New listings</span>
                    </Link>
                    <Link href={cat.trendingHref} onClick={closeDrawer}>
                      <span>Trending</span>
                    </Link>
                    {cat.subs.map((s) => (
                      <NavRow key={s.href} href={s.href} label={s.label} Link={Link} onClick={closeDrawer} />
                    ))}
                    <NavRow href={cat.saleHref} label="Sale" sale Link={Link} onClick={closeDrawer} icon={<ArrowRightIcon size={16} className="bp-pic" />} />
                    <Link href={cat.seeAllHref} className="bp-seeall" onClick={closeDrawer}>
                      <span>{cat.seeAllLabel}</span>
                    </Link>
                  </nav>
                  {cat.terms.length > 0 && (
                    <nav className="bp-drawer-list bp-drawer-list-terms">
                      {cat.terms.map((t) => (
                        <NavRow key={t.href} href={t.href} label={t.label} Link={Link} onClick={closeDrawer} />
                      ))}
                    </nav>
                  )}
                </>
              );
            })()
          ) : (
            <>
              <div className="bp-drawer-head">
                {logo}
                <button type="button" aria-label="Close" onClick={closeDrawer}>
                  <CloseIcon size={20} />
                </button>
              </div>
              {!auth && (
                <div className="bp-drawer-cta">
                  <Link href={sellHref} className="bp-btn bp-btn-green" onClick={closeDrawer}>
                    Sell now
                  </Link>
                  <Link href={signUpHref} className="bp-btn bp-btn-olite" onClick={closeDrawer}>
                    Sign up
                  </Link>
                  <div className="bp-drawer-login">
                    <Link href={signInHref} onClick={closeDrawer}>
                      Login
                    </Link>
                  </div>
                </div>
              )}
              <nav className="bp-drawer-list">
                {categories.map((cat) => (
                  <NavRow
                    key={cat.key}
                    href="#"
                    label={cat.label}
                    Link={Link}
                    icon={<ArrowRightIcon size={16} className="bp-pic" />}
                    onClick={() => setDrawerLevel({ key: cat.key })}
                  />
                ))}
              </nav>
              {auth ? (
                <>
                  <nav className="bp-drawer-list bp-drawer-list-quiet">
                    <Link href={accountHref} className="bp-drawer-who">
                      <span>Your profile</span>
                      <span className="bp-acct-av" />
                    </Link>
                    <Link href={sellHref}>Sell</Link>
                    <Link href={dashboardHref}>Store dashboard</Link>
                    <Link href={ordersHref}>Purchases</Link>
                    <Link href={accountHref}>Account</Link>
                    <Link href={helpHref}>Help</Link>
                  </nav>
                  <div className="bp-drawer-out">
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        onLogout?.();
                        closeDrawer();
                      }}
                    >
                      Log out
                    </a>
                  </div>
                </>
              ) : (
                <>
                  <nav className="bp-drawer-list bp-drawer-list-quiet">
                    <Link href={`${searchHref}?sort=new`}>New listings</Link>
                    <Link href={`${searchHref}?sort=trending`}>Trending</Link>
                  </nav>
                  <div className="bp-drawer-out">
                    <Link href={signUpHref}>Sign up</Link>
                    <Link href={signInHref}>Login</Link>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export { SiteNav };
