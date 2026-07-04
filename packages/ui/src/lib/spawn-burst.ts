/**
 * Shared particle-burst spawner — the liquid sparkle click-burst on
 * `.bp-btn-green` and the mini-heart float-up on `.bp-fav` are the same
 * shape (spawn N short-lived absolutely-positioned children, let their
 * own CSS animation remove them). One implementation, two call sites.
 *
 * No-ops under prefers-reduced-motion (the click/like still registers —
 * only the decorative particles are skipped).
 */
export function spawnBurst(
  container: HTMLElement,
  opts: {
    className: string;
    count: number;
    x: number;
    y: number;
    spread: number;
    durationMs: number;
    content?: string;
  },
) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  for (let i = 0; i < opts.count; i++) {
    const angle = (Math.PI * 2 * i) / opts.count + Math.random() * 0.6;
    const dist = opts.spread * (0.6 + Math.random() * 0.4);
    const span = document.createElement("span");
    span.className = opts.className;
    span.style.left = `${opts.x}px`;
    span.style.top = `${opts.y}px`;
    span.style.setProperty("--bp-dx", `${Math.cos(angle) * dist}px`);
    span.style.setProperty("--bp-dy", `${Math.sin(angle) * dist}px`);
    span.style.setProperty("--bp-hx", `${Math.cos(angle) * dist}px`);
    if (opts.content) span.textContent = opts.content;
    container.appendChild(span);
    window.setTimeout(() => span.remove(), opts.durationMs);
  }
}
