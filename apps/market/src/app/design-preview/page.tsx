"use client";

import * as React from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Button,
  Chip,
  Tgl,
  Tlink,
  FoilBadge,
  Pcard,
  Rail,
  RailItem,
  SiteNav,
  SiteFooter,
  MobileBottomBar,
  type NavCategory,
} from "@bushpop/ui";
import { placeholderImage } from "./placeholder-image";

const CATEGORIES: NavCategory[] = [
  {
    key: "women",
    label: "Women",
    drawerTitle: "Women's categories",
    seeAllLabel: "See all womenswear",
    seeAllHref: "/shop?cat=women",
    newHref: "/shop?cat=women&sort=new",
    trendingHref: "/shop?cat=women&sort=trending",
    saleHref: "/shop?cat=women&sale=1",
    subs: [
      { label: "Tops", href: "/search?q=womens tops" },
      { label: "Dresses", href: "/search?q=womens dresses" },
      { label: "Shoes", href: "/search?q=womens shoes" },
    ],
    terms: [
      { label: "Crop tops", href: "/search?q=womens crop tops" },
      { label: "Skirts", href: "/search?q=womens skirts" },
    ],
  },
  {
    key: "men",
    label: "Men",
    drawerTitle: "Men's categories",
    seeAllLabel: "See all menswear",
    seeAllHref: "/shop?cat=men",
    newHref: "/shop?cat=men&sort=new",
    trendingHref: "/shop?cat=men&sort=trending",
    saleHref: "/shop?cat=men&sale=1",
    subs: [
      { label: "Tops", href: "/search?q=mens tops" },
      { label: "Shoes", href: "/search?q=mens shoes" },
    ],
    terms: [{ label: "Sneakers", href: "/search?q=mens sneakers" }],
  },
];

const DEMO_ITEMS = [
  { hue: 150, title: "Vintage denim jacket", brand: "Levi's", size: "M", price: "$48", badge: "fresh" as const },
  { hue: 20, title: "Classic leather boots", brand: "Blundstone", size: "9", price: "$62", rrp: "$90", save: "SAVE $28", badge: "gold" as const },
  { hue: 260, title: "Wool knit jumper", brand: "Uniqlo", size: "L", price: "$24", rrp: "$32", badge: "deal" as const },
  { hue: 40, title: "Handmade ceramic mug", brand: "Local maker", size: "—", price: "$18", badge: "trust" as const },
];

function Logo({ small }: { small?: boolean }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-bp-head)",
        fontWeight: 800,
        fontSize: small ? 16 : 18,
        letterSpacing: "-0.02em",
        color: "var(--color-bp-green-ink)",
      }}
    >
      Bushpop
    </span>
  );
}

/**
 * Internal, unlinked QA surface for the U0 design-system port — exercises
 * SiteNav/SiteFooter/Pcard/Button/FoilBadge/Rail for the screenshot-parity
 * pass against design/home/. Not linked from any real nav; 404s in
 * production builds. Live layout.tsx integration (real session/bag data)
 * is recommended for U1, where the buyer funnel gets real cart/auth wiring
 * anyway — see the PR description.
 */
export default function DesignPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const [favorited, setFavorited] = React.useState<Record<number, boolean>>({});
  const [chipOn, setChipOn] = React.useState(false);
  const [tglOn, setTglOn] = React.useState(false);

  return (
    <div style={{ paddingBottom: 72 }}>
      <h2 style={{ padding: "12px 24px", fontFamily: "var(--font-bp-head)" }}>Nav — visitor</h2>
      <SiteNav logo={<Logo />} auth={false} categories={CATEGORIES} LinkComponent={Link} />

      <h2 style={{ padding: "12px 24px", fontFamily: "var(--font-bp-head)" }}>Nav — logged in, bag total</h2>
      <SiteNav
        logo={<Logo />}
        auth
        bagTotal={234}
        bagCount={6}
        categories={CATEGORIES}
        LinkComponent={Link}
        onLogout={() => {}}
      />

      <section style={{ padding: "32px 24px" }}>
        <h2 style={{ fontFamily: "var(--font-bp-head)", marginBottom: 16 }}>Buttons</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <Button variant="primary">Add to bag</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="outline">Log in</Button>
          <Button variant="dark">Sign up</Button>
          <Button variant="primary" size="sm">
            Sell
          </Button>
          <Button variant="primary" size="lg">
            Buy now
          </Button>
          <Button variant="destructive">Cancel listing</Button>
        </div>
      </section>

      <section style={{ padding: "0 24px 32px" }}>
        <h2 style={{ fontFamily: "var(--font-bp-head)", marginBottom: 16 }}>Chip · toggle · text link</h2>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Chip active={chipOn} onClick={() => setChipOn((v) => !v)}>
            Excellent
          </Chip>
          <Chip>Size M</Chip>
          <Tgl checked={tglOn} onCheckedChange={setTglOn} aria-label="On sale only" />
          <Tlink href="#">See all →</Tlink>
        </div>
      </section>

      <section style={{ padding: "0 24px 32px" }}>
        <h2 style={{ fontFamily: "var(--font-bp-head)", marginBottom: 16 }}>Product rail (treatment D)</h2>
        <Rail>
          {DEMO_ITEMS.map((item, i) => (
            <RailItem key={item.title} style={{ width: "42%", maxWidth: 220 }}>
              <Pcard
                imageSrc={placeholderImage(item.hue, item.title)}
                imageAlt={item.title}
                title={item.title}
                brand={item.brand}
                size={item.size}
                price={item.price}
                rrp={item.rrp}
                saveLabel={item.save}
                favorited={favorited[i] ?? false}
                onFavoriteToggle={(next) => setFavorited((f) => ({ ...f, [i]: next }))}
                badges={
                  item.badge === "deal" ? (
                    <FoilBadge variant="deal">20% OFF</FoilBadge>
                  ) : item.badge === "gold" ? (
                    <FoilBadge variant="gold">SAVE $28</FoilBadge>
                  ) : item.badge === "fresh" ? (
                    <FoilBadge variant="fresh">Just listed</FoilBadge>
                  ) : (
                    <FoilBadge variant="trust">Handmade</FoilBadge>
                  )
                }
              />
            </RailItem>
          ))}
        </Rail>
      </section>

      <SiteFooter
        logo={<Logo small />}
        tagline="Preloved fashion, done properly."
        channelName="Bushpop"
        copyrightYear={2026}
        columns={[
          { heading: "Shop", links: [{ label: "Browse", href: "/shop" }, { label: "Sell", href: "/sell" }] },
          { heading: "Account", links: [{ label: "Sign in", href: "/sign-in" }, { label: "Orders", href: "/orders" }] },
          { heading: "Support", links: [{ label: "Help", href: "/help" }] },
        ]}
      />

      <MobileBottomBar />
    </div>
  );
}
