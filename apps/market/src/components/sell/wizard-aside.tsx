"use client";

import {
  computeListingStrength,
  strengthBand,
  type ListingStrengthInput,
  type StrengthComponentKey,
} from "@bushpop/config";
import { useSellDraftStore } from "@/lib/sell/store";
import type { SellDraft } from "@/lib/sell/types";

const GAUGE_RADIUS = 26;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

const STEP_SLUG_BY_INDEX = {
  0: "photos",
  1: "details",
  2: "condition",
  3: "price",
} as const;

const TIP_VARIANTS = {
  photo: {
    eyebrow: "Photo tip",
    body: "Shoot on a hanger or laid flat against a plain wall. Clean photos lift buyer confidence.",
  },
  search: {
    eyebrow: "Search tip",
    body: "Put the brand and item type in the title. That is exactly what buyers type into search.",
  },
  trust: {
    eyebrow: "Trust tip",
    body: "Real laid-flat measurements cut returns and help buyers trust the fit before they buy.",
  },
} as const;

export interface WizardAsideProps {
  onJumpToStep?: (step: string) => void;
}

function hasMeasurementValues(
  measurements: SellDraft["measurements"],
): boolean {
  if (!measurements) {
    return false;
  }

  return Object.values(measurements).some(
    (value) => typeof value === "number" && Number.isFinite(value) && value > 0,
  );
}

export function buildLiveStrengthInput(draft: SellDraft | null): ListingStrengthInput {
  return {
    photoCount: draft?.images.filter((image) => image.status === "ready").length ?? 0,
    title: draft?.title ?? null,
    brand: draft?.brand ?? null,
    categoryLeaf: draft?.categoryId ?? draft?.category?.slug ?? null,
    size: draft?.size ?? null,
    sizeExempt: draft?.measurementTemplate.sizeExempt ?? false,
    colour: draft?.colour ?? null,
    description: draft?.description ?? null,
    condition: draft?.condition ?? null,
    hasMeasurements: hasMeasurementValues(draft?.measurements ?? null),
    priceCents: draft?.askingPriceCents ?? null,
    rrpCents: draft?.rrpCents ?? null,
    offersEnabled: false,
  };
}

function getBandCopy(score: number): { label: string; support: string } {
  switch (strengthBand(score)) {
    case "excellent":
      return {
        label: "Excellent",
        support: "Listings like this sell up to 3x faster",
      };
    case "strong":
      return {
        label: "Strong",
        support: "Nearly there. A couple of boosts to go.",
      };
    case "good-start":
      return {
        label: "Good start",
        support: "Keep going. Every step lifts your odds.",
      };
    default:
      return {
        label: "Just started",
        support: "Complete the steps to lift your odds.",
      };
  }
}

export function getNearMiss(score: number): { remaining: number; nextBand: string } | null {
  if (score >= 90) {
    return null;
  }

  if (score < 40) {
    return { remaining: 40 - score, nextBand: "Good start" };
  }

  if (score < 70) {
    return { remaining: 70 - score, nextBand: "Strong" };
  }

  return { remaining: 90 - score, nextBand: "Excellent" };
}

function getJumpStep(step: number): string | null {
  return STEP_SLUG_BY_INDEX[step as keyof typeof STEP_SLUG_BY_INDEX] ?? null;
}

function getTipKey(missingKey: StrengthComponentKey | undefined): keyof typeof TIP_VARIANTS {
  if (missingKey === "photos") {
    return "photo";
  }

  if (missingKey === "measurements" || missingKey === "condition") {
    return "trust";
  }

  return "search";
}

export function WizardAside({ onJumpToStep }: WizardAsideProps) {
  const draft = useSellDraftStore((state) => state.draft);
  const strength = computeListingStrength(buildLiveStrengthInput(draft));
  const band = getBandCopy(strength.score);
  const nearMiss = getNearMiss(strength.score);
  const nextSteps = strength.missing.slice(0, 3);
  const tip = TIP_VARIANTS[getTipKey(strength.missing[0]?.key)];
  const dashArray = GAUGE_CIRCUMFERENCE.toFixed(1);
  const dashOffset = (GAUGE_CIRCUMFERENCE * (1 - (strength.score / 100))).toFixed(1);

  return (
    <>
      <div className="strengthmini" aria-label={`Listing strength ${strength.score} out of 100`}>
        <span>Listing strength</span>
        <div className="bar" aria-hidden="true">
          <i style={{ width: `${strength.score}%` }} />
        </div>
        <b>{strength.score}</b>
      </div>

      <div className="card strength">
        <h3>Listing strength</h3>

        <div className="shead">
          <div className="sgauge" aria-label={`Listing strength ${strength.score} out of 100`}>
            <svg viewBox="0 0 64 64" aria-hidden="true">
              <circle
                className="bgc"
                cx="32"
                cy="32"
                r={GAUGE_RADIUS}
                fill="none"
                strokeWidth="7"
              />
              <circle
                className="fgc"
                cx="32"
                cy="32"
                r={GAUGE_RADIUS}
                fill="none"
                strokeWidth="7"
                strokeDasharray={dashArray}
                strokeDashoffset={dashOffset}
              />
            </svg>
            <span className="snum">{strength.score}</span>
          </div>

          <div>
            <div className="sband">{band.label}</div>
            <div className="sspeed">{band.support}</div>
            {nearMiss ? (
              <div className="nmiss">
                {nearMiss.remaining} pts to {nearMiss.nextBand}
              </div>
            ) : null}
          </div>
        </div>

        {nextSteps.length > 0 ? (
          <div className="snext">
            {nextSteps.map((item) => {
              const stepSlug = getJumpStep(item.step);
              const isJumpable = stepSlug !== null && typeof onJumpToStep === "function";

              const jump = () => {
                if (isJumpable && stepSlug) {
                  onJumpToStep(stepSlug);
                }
              };

              return (
                <div
                  key={`${item.key}-${item.step}`}
                  className="nx"
                  role={isJumpable ? "button" : undefined}
                  tabIndex={isJumpable ? 0 : undefined}
                  onClick={jump}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      jump();
                    }
                  }}
                >
                  <span>
                    {item.label} - +{item.points} pts
                  </span>
                  <b>Jump</b>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="card tipcard">
        <div className="eyebrow">{tip.eyebrow}</div>
        <p>{tip.body}</p>
      </div>
    </>
  );
}
