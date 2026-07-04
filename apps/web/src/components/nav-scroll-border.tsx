"use client";

// Toggles `.scrolled` on the nearest .nav header once the page scrolls past
// 8px — borderless-until-scroll per HANDOFF-nav.md. Isolated client leaf
// (renders nothing itself) so SiteNav stays server-rendered around it.
import { useEffect } from "react";

export function NavScrollBorder() {
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>(".nav");
    if (!nav) return;
    const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return null;
}
