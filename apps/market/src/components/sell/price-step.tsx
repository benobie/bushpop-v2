"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent, type JSX } from "react";
import { calcFeeCents, calcPayoutCents, PARCELS } from "@bushpop/config";
import { formatMoney } from "@/lib/format-money";
import { useSellDraftStore } from "@/lib/sell/store";

const PAYOUT_ANIMATION_MS = 380;
// Illustrative competitor-rate comparison only; Bushpop's actual fee always comes from config.
const ILLUSTRATIVE_COMPETITOR_RATE = 0.10;

function sanitizeMoneyInput(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [whole = "", ...fractionParts] = cleaned.split(".");

  if (fractionParts.length === 0) {
    return whole;
  }

  const fraction = fractionParts.join("").slice(0, 2);
  return `${whole}.${fraction}`;
}

function parseDisplayCents(value: string): number {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === ".") {
    return 0;
  }

  const amount = Number.parseFloat(trimmed);
  if (!Number.isFinite(amount) || amount < 0) {
    return 0;
  }

  return Math.round(amount * 100);
}

function parsePatchCents(value: string): number | null {
  const cents = parseDisplayCents(value);
  return cents > 0 ? cents : null;
}

function formatInputValue(cents: number | null | undefined): string {
  if (typeof cents !== "number" || !Number.isFinite(cents) || cents <= 0) {
    return "";
  }

  return (cents / 100).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function isKnownParcelSize(value: string | null | undefined): value is keyof typeof PARCELS {
  return typeof value === "string" && Object.hasOwn(PARCELS, value);
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

export function PriceStep(): JSX.Element {
  const draft = useSellDraftStore((state) => state.draft);
  const patchPrice = useSellDraftStore((state) => state.patchPrice);

  const askingPriceId = useId();
  const rrpId = useId();

  const [askingPriceInput, setAskingPriceInput] = useState(() =>
    formatInputValue(draft?.askingPriceCents),
  );
  const [rrpInput, setRrpInput] = useState(() => formatInputValue(draft?.rrpCents));
  const [animatedPayoutCents, setAnimatedPayoutCents] = useState(() => {
    const initialPriceCents = draft?.askingPriceCents ?? 0;
    if (initialPriceCents <= 0) {
      return 0;
    }

    const prepaidLabelCents =
      draft?.shippingOption === "prepaid" && isKnownParcelSize(draft.parcelSize)
        ? PARCELS[draft.parcelSize].costCents
        : 0;

    return calcPayoutCents(initialPriceCents, { prepaidLabelCents });
  });

  const hasMountedRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const displayedPayoutRef = useRef(animatedPayoutCents);

  useEffect(() => {
    if (!draft) {
      if (askingPriceInput !== "") {
        setAskingPriceInput("");
      }
      if (rrpInput !== "") {
        setRrpInput("");
      }
      return;
    }

    if (draft.askingPriceCents !== parsePatchCents(askingPriceInput)) {
      setAskingPriceInput(formatInputValue(draft.askingPriceCents));
    }

    if (draft.rrpCents !== parsePatchCents(rrpInput)) {
      setRrpInput(formatInputValue(draft.rrpCents));
    }
  }, [draft?.askingPriceCents, draft?.id, draft?.rrpCents]);

  const salePriceCents = parseDisplayCents(askingPriceInput);
  const prepaidLabelCents =
    draft?.shippingOption === "prepaid" && isKnownParcelSize(draft.parcelSize)
      ? PARCELS[draft.parcelSize].costCents
      : 0;
  const bushpopFeeCents = salePriceCents > 0 ? calcFeeCents(salePriceCents) : 0;
  const payoutTargetCents =
    salePriceCents > 0
      ? calcPayoutCents(salePriceCents, { prepaidLabelCents })
      : 0;
  const tenPercentFeeCents =
    salePriceCents > 0 ? Math.round(salePriceCents * ILLUSTRATIVE_COMPETITOR_RATE) : 0;
  const comparisonDeltaCents = tenPercentFeeCents - bushpopFeeCents;

  useEffect(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      displayedPayoutRef.current = payoutTargetCents;
      setAnimatedPayoutCents(payoutTargetCents);
      return;
    }

    if (prefersReducedMotion()) {
      displayedPayoutRef.current = payoutTargetCents;
      setAnimatedPayoutCents(payoutTargetCents);
      return;
    }

    const startValue = displayedPayoutRef.current;
    if (startValue === payoutTargetCents) {
      setAnimatedPayoutCents(payoutTargetCents);
      return;
    }

    let startedAt: number | null = null;

    const animate = (timestamp: number) => {
      if (startedAt === null) {
        startedAt = timestamp;
      }

      const elapsed = timestamp - startedAt;
      const progress = Math.min(elapsed / PAYOUT_ANIMATION_MS, 1);
      const eased = easeOutCubic(progress);
      const nextValue = Math.round(startValue + (payoutTargetCents - startValue) * eased);

      displayedPayoutRef.current = nextValue;
      setAnimatedPayoutCents(nextValue);

      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(animate);
        return;
      }

      displayedPayoutRef.current = payoutTargetCents;
      animationFrameRef.current = null;
      setAnimatedPayoutCents(payoutTargetCents);
    };

    animationFrameRef.current = window.requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [payoutTargetCents]);

  function handleAskingPriceChange(event: ChangeEvent<HTMLInputElement>): void {
    const nextValue = sanitizeMoneyInput(event.target.value);
    setAskingPriceInput(nextValue);
    patchPrice({ askingPriceCents: parsePatchCents(nextValue) });
  }

  function handleRrpChange(event: ChangeEvent<HTMLInputElement>): void {
    const nextValue = sanitizeMoneyInput(event.target.value);
    setRrpInput(nextValue);
    patchPrice({ rrpCents: parsePatchCents(nextValue) });
  }

  return (
    <>
      <div className="field pricebox">
        <label htmlFor={askingPriceId}>
          Asking price
          <span>What you want the buyer to pay.</span>
        </label>
        <div className="bigprice">
          <span className="dollar" aria-hidden="true">
            $
          </span>
          <input
            id={askingPriceId}
            className="inp"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={askingPriceInput}
            onChange={handleAskingPriceChange}
            disabled={draft === null}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor={rrpId}>
          Original RRP
          <span>Optional, if you know it.</span>
        </label>
        <input
          id={rrpId}
          className="inp"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={rrpInput}
          onChange={handleRrpChange}
          disabled={draft === null}
        />
      </div>

      <div className="payout" aria-live="polite">
        <div className="pr">
          <span>Sale price</span>
          <b>{formatMoney(salePriceCents)}</b>
        </div>
        <div className="pr">
          <span>Bushpop fee</span>
          <b>-{formatMoney(bushpopFeeCents)}</b>
        </div>
        {prepaidLabelCents > 0 ? (
          <div className="pr">
            <span>Shipping label</span>
            <b>-{formatMoney(prepaidLabelCents)}</b>
          </div>
        ) : null}
        <div className="pr tot">
          <span>You receive</span>
          <span>{formatMoney(animatedPayoutCents)}</span>
        </div>
        {comparisonDeltaCents > 0 ? (
          <p className="pcomp">
            On a typical 10%-fee marketplace you&apos;d pay {formatMoney(comparisonDeltaCents)}{" "}
            more.
          </p>
        ) : null}
      </div>
    </>
  );
}
