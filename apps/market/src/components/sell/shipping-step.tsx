"use client";

import type { JSX } from "react";
import {
  PARCELS,
  PARCEL_SIZES,
  SHIPPING_OPTIONS,
  SHIPPING_OPTION_LABELS,
  parcelToShippingClass,
  type ParcelSize,
  type ShippingOption,
} from "@bushpop/config";
import { useSellDraftStore } from "@/lib/sell/store";

const DEFAULT_SHIPPING_OPTION: ShippingOption = "prepaid";

const SHIPPING_OPTION_COPY: Record<
  ShippingOption,
  {
    description: string;
    tag: string;
  }
> = {
  prepaid: {
    description: "Bushpop provides the label and deducts it from your payout.",
    tag: "Default",
  },
  buyer_pays: {
    description: "Postage is added to the buyer's total at checkout.",
    tag: "At checkout",
  },
  free: {
    description: "Build postage into your asking price.",
    tag: "All-in price",
  },
  pickup: {
    description: "Arrange local collection with the buyer.",
    tag: "No parcel",
  },
};

const currencyFormatter = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
});

export function ShippingStep(): JSX.Element {
  const draft = useSellDraftStore((state) => state.draft);
  const patchShipping = useSellDraftStore((state) => state.patchShipping);

  const shippingOption = resolveShippingOption(draft?.shippingOption);
  const parcelSize = resolveParcelSize(draft?.parcelSize);
  const showParcelPicker = shippingOption !== "pickup";

  function selectShippingOption(option: ShippingOption): void {
    if (!draft) {
      return;
    }

    if (
      draft.shippingOption === option &&
      (option !== "pickup" || draft.parcelSize === null)
    ) {
      return;
    }

    if (option === "pickup") {
      patchShipping({ shippingOption: option, parcelSize: null }, { immediate: true });
      return;
    }

    patchShipping({ shippingOption: option }, { immediate: true });
  }

  function selectParcelSize(nextParcelSize: ParcelSize): void {
    if (!draft) {
      return;
    }

    if (
      draft.parcelSize === nextParcelSize &&
      draft.shippingOption === shippingOption
    ) {
      return;
    }

    patchShipping(
      {
        shippingOption,
        parcelSize: nextParcelSize,
      },
      { immediate: true },
    );
  }

  return (
    <section aria-labelledby="sell-shipping-heading">
      <h2 id="sell-shipping-heading">Shipping</h2>
      <p className="hint">Choose how this item gets to the buyer.</p>

      <div className="ship" role="group" aria-label="Shipping options">
        {SHIPPING_OPTIONS.map((option) => {
          const copy = SHIPPING_OPTION_COPY[option];
          const isSelected = option === shippingOption;

          return (
            <div
              key={option}
              role="button"
              tabIndex={0}
              className={isSelected ? "shipopt on" : "shipopt"}
              aria-pressed={isSelected}
              onClick={() => {
                selectShippingOption(option);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  selectShippingOption(option);
                }
              }}
            >
              <span className="dot" aria-hidden="true" />
              <div className="txt">
                <h4>{SHIPPING_OPTION_LABELS[option]}</h4>
                <p>{copy.description}</p>
              </div>
              <span className="tag">{copy.tag}</span>
            </div>
          );
        })}
      </div>

      {showParcelPicker ? (
        <>
          <p className="hint">Pick the parcel size that best matches this item.</p>
          <div className="pick" role="group" aria-label="Parcel size">
            {PARCEL_SIZES.map((size) => {
              const parcel = PARCELS[size];
              const isSelected = size === parcelSize;

              return (
                <button
                  key={size}
                  type="button"
                  className={isSelected ? "pk on" : "pk"}
                  aria-pressed={isSelected}
                  title={`Shipping class ${parcelToShippingClass(size).toUpperCase()}`}
                  onClick={() => {
                    selectParcelSize(size);
                  }}
                >
                  {parcel.label} - {formatCurrency(parcel.costCents)}
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      <div className="postest">
        <b>Postage estimate</b>
        <span>{buildPostageEstimate(shippingOption, parcelSize)}</span>
      </div>
    </section>
  );
}

function buildPostageEstimate(
  shippingOption: ShippingOption,
  parcelSize: ParcelSize | null,
): string {
  const parcelCost = parcelSize ? formatCurrency(PARCELS[parcelSize].costCents) : null;

  switch (shippingOption) {
    case "prepaid":
      return parcelCost
        ? `Bushpop provides a prepaid label - ${parcelCost} is deducted from your payout.`
        : "Bushpop provides a prepaid label - the cost is deducted from your payout.";
    case "buyer_pays":
      return parcelCost
        ? `${parcelCost} postage is added to the buyer's total at checkout.`
        : "Postage is added to the buyer's total at checkout.";
    case "free":
      return parcelCost
        ? `You're covering ${parcelCost} postage - factor it into your price.`
        : "You're covering postage - factor it into your price.";
    case "pickup":
      return "No shipping - buyer collects from you.";
  }
}

function formatCurrency(cents: number): string {
  return currencyFormatter.format(cents / 100);
}

function resolveShippingOption(
  shippingOption: string | null | undefined,
): ShippingOption {
  return isShippingOption(shippingOption) ? shippingOption : DEFAULT_SHIPPING_OPTION;
}

function resolveParcelSize(parcelSize: string | null | undefined): ParcelSize | null {
  return isParcelSize(parcelSize) ? parcelSize : null;
}

function isShippingOption(value: string | null | undefined): value is ShippingOption {
  return SHIPPING_OPTIONS.includes(value as ShippingOption);
}

function isParcelSize(value: string | null | undefined): value is ParcelSize {
  return PARCEL_SIZES.includes(value as ParcelSize);
}
