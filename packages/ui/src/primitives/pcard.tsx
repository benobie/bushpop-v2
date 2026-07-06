"use client";

import * as React from "react";
import { HeartIcon } from "../icons/nav-icons";
import { cn } from "../lib/cn";
import { useCursorLight } from "../lib/use-cursor-light";
import { spawnBurst } from "../lib/spawn-burst";

export interface PcardProps extends React.HTMLAttributes<HTMLDivElement> {
  imageSrc: string;
  imageAlt: string;
  title: string;
  /** Pre-formatted price string (money formatting is a consumer concern). */
  price: string;
  /** Cents suffix rendered as `<sup>`, e.g. ".99" — optional. */
  priceSuffix?: string;
  rrp?: string;
  saveLabel?: string;
  size?: string;
  brand?: string;
  /** Badges (FoilBadge elements) positioned top-left over the image. */
  badges?: React.ReactNode;
  favorited?: boolean;
  onFavoriteToggle?: (next: boolean) => void;
  favoriteLabel?: string;
  /** Mark as LCP-critical — disables lazy loading + hints fetchPriority=high. Use for the first 1-2 above-the-fold cards only. */
  priority?: boolean;
}

/** Product card, treatment D (LOCKED). At-rest light = buttons only; cards light on hover only. */
const Pcard = React.forwardRef<HTMLDivElement, PcardProps>(
  (
    {
      className,
      imageSrc,
      imageAlt,
      title,
      price,
      priceSuffix,
      rrp,
      saveLabel,
      size,
      brand,
      badges,
      favorited = false,
      onFavoriteToggle,
      favoriteLabel = "Save",
      priority = false,
      ...props
    },
    ref,
  ) => {
    const imgRef = useCursorLight<HTMLDivElement>("--bp-cx", "--bp-cy");

    const handleFavClick = React.useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const next = !favorited;
        if (next) {
          const rect = e.currentTarget.getBoundingClientRect();
          spawnBurst(e.currentTarget, {
            className: "bp-mh",
            count: 3,
            x: rect.width / 2,
            y: rect.height / 2,
            spread: 20,
            durationMs: 700,
            content: "♥",
          });
        }
        onFavoriteToggle?.(next);
      },
      [favorited, onFavoriteToggle],
    );

    return (
      <div ref={ref} className={cn("bp-pcard", className)} {...props}>
        <div ref={imgRef} className="bp-pimg">
          {badges}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc}
            alt={imageAlt}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : undefined}
          />
          <button
            type="button"
            className={cn("bp-fav", favorited && "bp-fav-on")}
            aria-pressed={favorited}
            aria-label={favoriteLabel}
            onClick={handleFavClick}
          >
            <HeartIcon size={16} />
          </button>
        </div>
        {saveLabel && <span className="bp-psave">{saveLabel}</span>}
        <p className="bp-pname">{title}</p>
        {brand && <p className="bp-pbrand">{brand}</p>}
        {rrp && <p className="bp-prrp">{rrp}</p>}
        <p className="bp-pprice">
          {price}
          {priceSuffix && <sup>{priceSuffix}</sup>}
        </p>
        {size && <p className="bp-psize">{size}</p>}
      </div>
    );
  },
);
Pcard.displayName = "Pcard";

export { Pcard };
