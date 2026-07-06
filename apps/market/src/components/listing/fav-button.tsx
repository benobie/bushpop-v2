"use client";

/**
 * Wishlist heart toggle — overlays a listing image on cards and the PDP.
 * Optimistic; reverts on API failure. Doesn't know the viewer's auth state
 * up front (that would mean threading a prop through every page that
 * renders a listing card) — a 401 from the wishlist API is itself the
 * signed-out signal, so we just redirect to sign-in with a `next` param.
 */
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createBrowserApiClient } from "@bushpop/api-client/browser";
import { HeartIcon, cn } from "@bushpop/ui";
import { track } from "@/lib/analytics";
import { DEFAULT_CHANNEL } from "@bushpop/config";

interface FavButtonProps {
  listingId: string;
  initialFavorited?: boolean;
  /** "overlay" (default) = absolute-positioned heart over a card image, needs a `.bp-pcard` ancestor for the hover treatment. "inline" = plain button for non-card contexts like the PDP. */
  variant?: "overlay" | "inline";
  className?: string;
}

export function FavButton({
  listingId,
  initialFavorited = false,
  variant = "overlay",
  className,
}: FavButtonProps) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  async function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;

    const next = !favorited;
    setFavorited(next);
    setPending(true);

    const api = createBrowserApiClient();
    const { response } =
      next
        ? await api.POST("/api/v1/customer/wishlist", { body: { listingId } })
        : await api.DELETE("/api/v1/customer/wishlist/{listingId}", {
            params: { path: { listingId } },
          });

    if (response.status === 401) {
      setFavorited(!next);
      setPending(false);
      router.push(`/sign-in?next=${encodeURIComponent(pathname)}`);
      return;
    }

    if (!response.ok) {
      setFavorited(!next);
      setPending(false);
      return;
    }

    track({
      event: next ? "wishlist.added" : "wishlist.removed",
      props: { channel: DEFAULT_CHANNEL, listing_id: listingId },
    });
    setPending(false);
  }

  if (variant === "inline") {
    return (
      <button
        type="button"
        className={cn(
          "flex items-center gap-2 rounded-lg border border-brand-200 px-4 py-2 text-sm font-medium transition-colors",
          favorited ? "border-bp-red text-bp-red" : "text-brand-700 hover:bg-brand-50",
          className,
        )}
        aria-pressed={favorited}
        aria-label={favorited ? "Remove from favourites" : "Add to favourites"}
        onClick={handleClick}
      >
        <HeartIcon size={16} />
        {favorited ? "Saved" : "Save"}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={cn("bp-fav", favorited && "bp-fav-on", className)}
      aria-pressed={favorited}
      aria-label={favorited ? "Remove from favourites" : "Add to favourites"}
      onClick={handleClick}
    >
      <HeartIcon size={16} />
    </button>
  );
}
