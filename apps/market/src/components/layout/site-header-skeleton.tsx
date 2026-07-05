import { Wordmark } from "./wordmark";

/**
 * Static fallback rendered while SiteHeader resolves session + cart.
 * Matches the nav's real height (see lit-glass.css `.bp-nav`) so there's no
 * layout shift when the Suspense boundary resolves.
 */
export function SiteHeaderSkeleton() {
  return (
    <div className="bp-nav" aria-hidden="true">
      <div className="bp-nav-inner">
        <Wordmark className="h-6 text-bp-obsidian" />
      </div>
    </div>
  );
}
