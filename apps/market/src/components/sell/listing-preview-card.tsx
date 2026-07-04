"use client";

import "./listing-preview-card.css";

export interface ListingPreviewCardProps {
  title?: string | null;
  priceCents?: number | null;
  rrpCents?: number | null;
  coverImageUrl?: string | null;
  brand?: string | null;
  size?: string | null;
  condition?: string | null;
}

function hasText(value?: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasMoney(value?: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function formatPriceParts(cents: number): { dollars: string; cents: string } {
  const dollars = Math.floor(cents / 100);
  const cents2 = Math.abs(cents % 100).toString().padStart(2, "0");

  return {
    dollars: `$${dollars}`,
    cents: cents2,
  };
}

function formatMoney(cents: number): string {
  const { dollars, cents: cents2 } = formatPriceParts(cents);
  return `${dollars}.${cents2}`;
}

export function ListingPreviewCard({
  title,
  priceCents,
  rrpCents,
  coverImageUrl,
  brand,
  size,
  condition,
}: ListingPreviewCardProps) {
  const hasTitle = hasText(title);
  const hasPrice = hasMoney(priceCents);
  const imageSrc = hasText(coverImageUrl) ? coverImageUrl : null;

  const price = hasPrice ? formatPriceParts(priceCents) : null;
  let savings: { saved: number; pct: number; rrp: number } | null = null;

  if (hasPrice && hasMoney(rrpCents) && rrpCents > priceCents) {
    const saved = rrpCents - priceCents;
    savings = {
      saved,
      pct: Math.round((saved / rrpCents) * 100),
      rrp: rrpCents,
    };
  }

  const metaParts = [
    { value: size, fallback: "Size" },
    { value: condition, fallback: "Condition" },
    { value: brand, fallback: "Brand" },
  ];

  return (
    <div className="listing-preview-card">
      <div className="listing-preview-card__image">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={hasTitle ? title : "Listing preview image"}
            className="listing-preview-card__image-content"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="listing-preview-card__image-placeholder" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="listing-preview-card__placeholder-icon">
              <path
                d="M4.5 6.25A1.75 1.75 0 0 1 6.25 4.5h11.5a1.75 1.75 0 0 1 1.75 1.75v11.5a1.75 1.75 0 0 1-1.75 1.75H6.25A1.75 1.75 0 0 1 4.5 17.75zm1.5 10.92h12v-2.39l-3.25-3.25a1 1 0 0 0-1.41 0l-1.55 1.55-2.63-2.62a1 1 0 0 0-1.41 0L6 12.83zm8.13-7.79a1.56 1.56 0 1 0 0-3.12 1.56 1.56 0 0 0 0 3.12"
                fill="currentColor"
              />
            </svg>
          </div>
        )}
      </div>

      <p
        className={[
          "listing-preview-card__title",
          !hasTitle ? "listing-preview-card__title--placeholder" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {hasTitle ? title : "Your item title"}
      </p>

      {savings ? (
        <div className="listing-preview-card__savings">
          <span
            className="listing-preview-card__save"
            aria-label={`Save ${formatMoney(savings.saved)} (${savings.pct}% off)`}
          >
            SAVE {formatMoney(savings.saved)}
          </span>
          <span className="listing-preview-card__rrp">RRP: {formatMoney(savings.rrp)}</span>
        </div>
      ) : null}

      {price ? (
        <div className="listing-preview-card__price">
          <span className="listing-preview-card__price-main">{price.dollars}</span>
          <sup className="listing-preview-card__price-cents">{price.cents}</sup>
        </div>
      ) : (
        <div className="listing-preview-card__price listing-preview-card__price--placeholder">—</div>
      )}

      <div className="listing-preview-card__meta">
        {metaParts.map((part, index) => (
          <span key={part.fallback} className="listing-preview-card__meta-item">
            <span
              className={[
                "listing-preview-card__meta-text",
                !hasText(part.value) ? "listing-preview-card__meta-text--placeholder" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {hasText(part.value) ? part.value : part.fallback}
            </span>
            {index < metaParts.length - 1 ? (
              <span className="listing-preview-card__meta-separator" aria-hidden="true">
                {" "}
                •{" "}
              </span>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}
