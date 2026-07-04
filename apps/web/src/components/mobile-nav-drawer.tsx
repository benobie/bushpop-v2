"use client";

// Mobile burger + slide-in drawer — the marketplace's two-level category
// drawer (HANDOFF-nav.md) doesn't apply here (this content site has no shop
// taxonomy), so this is the simple single-level version: the site's own
// guide/about/help links + the Sell CTA. Gated behind SiteNav's `drawerNav`
// prop, defaulted OFF (Ben's call — see the PR body) — the zero-JS <details>
// disclosure remains the default mobile menu.
import Link from "next/link";
import { useState } from "react";
import { List, X } from "@phosphor-icons/react/dist/ssr";
import { Wordmark } from "./wordmark";

export function MobileNavDrawer({
  links,
  sellHref,
}: {
  links: { href: string; label: string }[];
  sellHref: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="burger"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <List size={22} weight="bold" />
      </button>
      <div className={open ? "ndrawer open" : "ndrawer"}>
        <div className="scrim" onClick={() => setOpen(false)} />
        <div className="panel" role="dialog" aria-label="Menu" aria-hidden={!open}>
          <div className="nd-head">
            <Wordmark className="wm" />
            <button type="button" className="x" aria-label="Close" onClick={() => setOpen(false)}>
              <X size={20} weight="bold" />
            </button>
          </div>
          <div className="nd-cta">
            <Link href={sellHref} className="btn green" onClick={() => setOpen(false)}>
              Sell now
            </Link>
          </div>
          <nav className="nd-list" aria-label="Mobile">
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </>
  );
}
