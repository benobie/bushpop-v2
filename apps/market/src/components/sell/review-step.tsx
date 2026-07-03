"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type JSX } from "react";
import {
  calcFeeCents,
  computeListingStrength,
  FLAT_RATE_SHIPPING_CENTS,
  isSizeExempt,
  PARCELS,
  SHIPPING_OPTION_LABELS,
  type ParcelSize,
} from "@bushpop/config";
import type { paths } from "@bushpop/api-client";
import { createBrowserApiClient } from "@bushpop/api-client/browser";
import { removeStoredSellDraftSnapshot } from "@/lib/sell/resume";
import { useSellDraftStore } from "@/lib/sell/store";
import type { SellDraft } from "@/lib/sell/types";
import { track } from "@/lib/analytics";
import {
  ListingPreviewCard,
  type ListingPreviewCardProps,
} from "./listing-preview-card";

type ReviewTab = "summary" | "preview";
type ReviewWizardStep =
  | "photos"
  | "details"
  | "condition"
  | "price"
  | "shipping"
  | "review";
type SummaryFieldKey =
  | "title"
  | "brand"
  | "category"
  | "size"
  | "colour"
  | "description"
  | "condition"
  | "measurements"
  | "price"
  | "shipping";

export type PublishGateKey =
  | "photos"
  | "title"
  | "category"
  | "size"
  | "condition"
  | "price"
  | "shipping"
  | "parcel"
  | "price_too_low"
  | "legal_agree";

type PublishResponse =
  paths["/api/v1/seller/drafts/{id}/publish"]["post"]["responses"][200]["content"]["application/json"];
type DuplicateResponse =
  paths["/api/v1/seller/drafts/{id}/duplicate"]["post"]["responses"][201]["content"]["application/json"];

type RequiredChecklistItem = {
  key: PublishGateKey;
  label: string;
  step: ReviewWizardStep;
};

type SummaryRow = {
  key: SummaryFieldKey;
  label: string;
  step: ReviewWizardStep;
};

interface PublishedState {
  result: PublishResponse;
  elapsedLabel: string;
}

export interface ReviewStepProps {
  onEditStep?: (step: string) => void;
}

const EMPTY_VALUE = "—";
const CONFETTI_COUNT = 46;
const ANALYTICS_CHANNEL = "bushpop";

const AI_FIELD_MAPPERS = [
  {
    field: "title",
    resolveCanonicalValue: (draft: SellDraft) => draft.title,
    resolveAiValue: (draft: SellDraft) => draft.aiTitle,
  },
  {
    field: "brand",
    resolveCanonicalValue: (draft: SellDraft) => draft.brand,
    resolveAiValue: (draft: SellDraft) => draft.aiSuggestedBrand,
  },
  {
    field: "category",
    resolveCanonicalValue: (draft: SellDraft) => draft.category?.slug ?? null,
    resolveAiValue: (draft: SellDraft) => draft.aiSuggestedCategory,
  },
  {
    field: "colour",
    resolveCanonicalValue: (draft: SellDraft) => draft.colour,
    resolveAiValue: (draft: SellDraft) => draft.aiSuggestedColour,
  },
  {
    field: "description",
    resolveCanonicalValue: (draft: SellDraft) => draft.description,
    resolveAiValue: (draft: SellDraft) => draft.aiDescription,
  },
] as const;

const REQUIRED_CHECKLIST_ITEMS: readonly RequiredChecklistItem[] = [
  { key: "photos", label: "Add at least 1 ready photo", step: "photos" },
  { key: "title", label: "Write a title", step: "details" },
  { key: "category", label: "Pick a category", step: "details" },
  { key: "size", label: "Pick a size", step: "details" },
  { key: "condition", label: "Set the condition", step: "condition" },
  { key: "price", label: "Set an asking price", step: "price" },
  { key: "shipping", label: "Choose a shipping option", step: "shipping" },
  { key: "parcel", label: "Choose a parcel size", step: "shipping" },
  { key: "price_too_low", label: "Keep prepaid payout above $0.00", step: "price" },
  { key: "legal_agree", label: "Agree to Bushpop's terms", step: "review" },
] as const;

const SUMMARY_ROWS: readonly SummaryRow[] = [
  { key: "title", label: "Title", step: "details" },
  { key: "brand", label: "Brand", step: "details" },
  { key: "category", label: "Category", step: "details" },
  { key: "size", label: "Size", step: "details" },
  { key: "colour", label: "Colour", step: "details" },
  { key: "description", label: "Description", step: "details" },
  { key: "condition", label: "Condition", step: "condition" },
  { key: "measurements", label: "Measurements", step: "condition" },
  { key: "price", label: "Price", step: "price" },
  { key: "shipping", label: "Shipping", step: "shipping" },
] as const;

const SUMMARY_MISSING_KEYS: Partial<Record<SummaryFieldKey, readonly PublishGateKey[]>> = {
  title: ["title"],
  category: ["category"],
  size: ["size"],
  condition: ["condition"],
  price: ["price", "price_too_low"],
  shipping: ["shipping", "parcel"],
};

const BOOST_STEP_BY_INDEX: Record<number, ReviewWizardStep> = {
  0: "photos",
  1: "details",
  2: "condition",
  3: "price",
};

const REQUIRED_STRENGTH_KEYS = new Set([
  "photos",
  "title",
  "category",
  "size",
  "condition",
  "price",
]);

const SERVER_MISSING_LABELS = REQUIRED_CHECKLIST_ITEMS.reduce<Record<PublishGateKey, string>>(
  (labels, item) => {
    labels[item.key] = item.label;
    return labels;
  },
  {
    photos: "Add at least 1 ready photo",
    title: "Write a title",
    category: "Pick a category",
    size: "Pick a size",
    condition: "Set the condition",
    price: "Set an asking price",
    shipping: "Choose a shipping option",
    parcel: "Choose a parcel size",
    price_too_low: "Keep prepaid payout above $0.00",
    legal_agree: "Agree to Bushpop's terms",
  },
);

const CONFETTI_PIECES = Array.from({ length: CONFETTI_COUNT }, (_, index) => ({
  id: index,
  color:
    index === 0
      ? "#f2c14e"
      : ["#16b34a", "#0a7d33", "#1d1d1f", "#f5f5f7", "#d7f5df"][index % 5],
  left: ((index * 17) % 84) - 42,
  drift: ((index * 29) % 240) - 120,
  drop: 88 + ((index * 19) % 120),
  rotate: ((index * 37) % 240) - 120,
  width: 6 + (index % 4),
  height: index % 5 === 0 ? 12 : 8 + (index % 3),
  delay: (index % 8) * 18,
  radius: index % 4 === 0 ? 999 : 4,
}));

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function formatMoney(cents: number | null | undefined): string {
  if (typeof cents !== "number" || !Number.isFinite(cents) || cents < 0) {
    return EMPTY_VALUE;
  }

  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(cents / 100);
}

function formatBandLabel(band: string): string {
  return band
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveElapsedMs(startedAt: number): number {
  const safeStart = Number.isFinite(startedAt) ? startedAt : Date.now();
  return Math.max(0, Date.now() - safeStart);
}

function formatElapsedLabelFromElapsedMs(elapsedMs: number): string {
  const elapsedSeconds = Math.max(1, Math.round(elapsedMs / 1000));

  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s`;
  }

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;

  if (minutes < 60) {
    return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}

function positiveMeasurementCount(measurements: SellDraft["measurements"]): number {
  if (!measurements) {
    return 0;
  }

  return Object.values(measurements).filter(
    (value) => typeof value === "number" && Number.isFinite(value) && value > 0,
  ).length;
}

function formatMeasurementSummary(draft: SellDraft): string {
  if (!draft.measurements) {
    return EMPTY_VALUE;
  }

  const parts = Object.entries(draft.measurements)
    .filter(([, value]) => typeof value === "number" && Number.isFinite(value) && value > 0)
    .map(([key, value]) => `${formatMeasurementLabel(key)} ${value} cm`);

  return parts.length > 0 ? parts.join(", ") : EMPTY_VALUE;
}

function formatMeasurementLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function resolveSizeExempt(draft: SellDraft): boolean {
  if (!draft.category) {
    return false;
  }

  return isSizeExempt(draft.category.parentSlug ?? draft.category.slug);
}

function resolveReadyImages(draft: SellDraft): SellDraft["images"] {
  return [...draft.images]
    .filter((image) => image.status === "ready")
    .sort((left, right) => {
      if (left.isPrimary !== right.isPrimary) {
        return left.isPrimary ? -1 : 1;
      }

      return left.position - right.position;
    });
}

function hasAnyAiSuggestions(draft: SellDraft): boolean {
  return Boolean(
    draft.aiTitle ??
      draft.aiDescription ??
      draft.aiSuggestedBrand ??
      draft.aiSuggestedCategory ??
      draft.aiSuggestedColour,
  );
}

function trackAiDraftOutcome(draft: SellDraft): boolean {
  const aiUsed = hasAnyAiSuggestions(draft);

  if (!aiUsed) {
    return false;
  }

  for (const fieldMapper of AI_FIELD_MAPPERS) {
    const aiValue = fieldMapper.resolveAiValue(draft);

    if (aiValue === null) {
      continue;
    }

    track({
      event:
        fieldMapper.resolveCanonicalValue(draft) === aiValue
          ? "wizard.ai_draft_kept"
          : "wizard.ai_draft_edited",
      props: {
        channel: ANALYTICS_CHANNEL,
        field: fieldMapper.field,
      },
    });
  }

  return true;
}

function resolvePreviewCardProps(draft: SellDraft): ListingPreviewCardProps {
  const coverImage = resolveReadyImages(draft)[0];

  return {
    title: draft.title,
    priceCents: draft.askingPriceCents,
    rrpCents: draft.rrpCents,
    coverImageUrl: coverImage?.url ?? null,
    brand: draft.brand,
    size: draft.size,
    condition: draft.condition,
  };
}

function resolveShippingSummary(draft: SellDraft): string {
  if (!hasText(draft.shippingOption) || !(draft.shippingOption in SHIPPING_OPTION_LABELS)) {
    return EMPTY_VALUE;
  }

  const optionLabel =
    SHIPPING_OPTION_LABELS[draft.shippingOption as keyof typeof SHIPPING_OPTION_LABELS];

  if (!hasText(draft.parcelSize) || !(draft.parcelSize in PARCELS)) {
    return optionLabel;
  }

  return `${optionLabel} - ${PARCELS[draft.parcelSize as ParcelSize].label}`;
}

function resolveSummaryValue(draft: SellDraft, field: SummaryFieldKey): string {
  switch (field) {
    case "title":
      return draft.title?.trim() || EMPTY_VALUE;
    case "brand":
      return draft.brand?.trim() || EMPTY_VALUE;
    case "category":
      return draft.category?.name ?? EMPTY_VALUE;
    case "size":
      return draft.size?.trim() || EMPTY_VALUE;
    case "colour":
      return draft.colour?.trim() || EMPTY_VALUE;
    case "description":
      return draft.description?.trim() || EMPTY_VALUE;
    case "condition":
      return draft.condition?.trim() || EMPTY_VALUE;
    case "measurements":
      return formatMeasurementSummary(draft);
    case "price":
      return formatMoney(draft.askingPriceCents);
    case "shipping":
      return resolveShippingSummary(draft);
  }
}

function resolvePublishLabelCostCents(draft: SellDraft): number {
  if (hasText(draft.parcelSize) && draft.parcelSize in PARCELS) {
    return PARCELS[draft.parcelSize as ParcelSize].costCents;
  }

  return FLAT_RATE_SHIPPING_CENTS[draft.shippingClass ?? "m"] ?? FLAT_RATE_SHIPPING_CENTS["m"]!;
}

export function computePublishGateMissing(
  draft: SellDraft,
  legalAgree: boolean,
): PublishGateKey[] {
  const missing: PublishGateKey[] = [];
  const readyImageCount = draft.images.filter((image) => image.status === "ready").length;

  if (readyImageCount < 1) missing.push("photos");
  if (!draft.title?.trim()) missing.push("title");
  if (!draft.category) missing.push("category");
  if (!resolveSizeExempt(draft) && !draft.size?.trim()) missing.push("size");
  if (!draft.condition?.trim()) missing.push("condition");
  if (!draft.askingPriceCents || draft.askingPriceCents <= 0) missing.push("price");
  if (!draft.shippingOption) missing.push("shipping");
  if (draft.shippingOption && draft.shippingOption !== "pickup" && !draft.parcelSize) {
    missing.push("parcel");
  }

  if (
    draft.shippingOption === "prepaid" &&
    draft.askingPriceCents &&
    draft.askingPriceCents > 0
  ) {
    const payout =
      draft.askingPriceCents -
      calcFeeCents(draft.askingPriceCents) -
      resolvePublishLabelCostCents(draft);

    if (payout <= 0) missing.push("price_too_low");
  }

  if (!legalAgree) missing.push("legal_agree");

  return missing;
}

function resolveStrengthBoosts(draft: SellDraft) {
  const strength = computeListingStrength({
    photoCount: draft.images.filter((image) => image.status === "ready").length,
    title: draft.title,
    brand: draft.brand,
    categoryLeaf: draft.category?.slug ?? null,
    size: draft.size,
    sizeExempt: resolveSizeExempt(draft),
    colour: draft.colour,
    description: draft.description,
    condition: draft.condition,
    hasMeasurements: positiveMeasurementCount(draft.measurements) > 0,
    priceCents: draft.askingPriceCents,
    rrpCents: draft.rrpCents,
    offersEnabled: false,
  });

  // Offers are excluded day 1 (D19) with no UI to act on the boost, so it
  // would otherwise show as a permanent, unactionable "Switch on offers" row.
  return strength.missing.filter(
    (item) => !REQUIRED_STRENGTH_KEYS.has(item.key) && item.key !== "offers",
  );
}

function dedupeMissingKeys(keys: readonly PublishGateKey[]): PublishGateKey[] {
  return Array.from(new Set(keys));
}

function serverMissingKeys(error: unknown): PublishGateKey[] {
  if (!isRecord(error) || !Array.isArray(error.missing)) {
    return [];
  }

  return error.missing.filter(
    (value): value is PublishGateKey => typeof value === "string" && value in SERVER_MISSING_LABELS,
  );
}

function serverMissingLabels(keys: readonly PublishGateKey[]): string[] {
  return keys.map((key) => SERVER_MISSING_LABELS[key] ?? key);
}

function scrollToChecklist(node: HTMLDivElement | null) {
  if (!node) {
    return;
  }

  node.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "center",
  });
}

function navigateTo(url: string) {
  if (typeof window === "undefined") {
    return;
  }

  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) {
    window.history.replaceState(null, "", url);
    return;
  }

  try {
    window.location.href = url;
  } catch {
    window.history.replaceState(null, "", url);
  }
}

export function ReviewStep({ onEditStep }: ReviewStepProps): JSX.Element {
  const draft = useSellDraftStore((state) => state.draft);
  const wizardMeta = useSellDraftStore((state) => state.wizardMeta);
  const [activeTab, setActiveTab] = useState<ReviewTab>("summary");
  const [legalAgree, setLegalAgree] = useState(false);
  const [published, setPublished] = useState<PublishedState | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [serverGateKeys, setServerGateKeys] = useState<PublishGateKey[]>([]);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastOut, setToastOut] = useState(false);
  const [confettiBurst, setConfettiBurst] = useState(false);
  const checklistRef = useRef<HTMLDivElement>(null);
  const agreeRef = useRef<HTMLInputElement>(null);
  const toastExitTimerRef = useRef<number | null>(null);
  const toastClearTimerRef = useRef<number | null>(null);
  const wobbleTimerRef = useRef<number | null>(null);
  const confettiTimerRef = useRef<number | null>(null);
  const agreeId = useId();

  useEffect(() => {
    setServerGateKeys([]);
    setPublishError(null);
  }, [draft, legalAgree]);

  useEffect(() => {
    if (!published || prefersReducedMotion()) {
      setConfettiBurst(false);
      return;
    }

    setConfettiBurst(false);
    confettiTimerRef.current = window.setTimeout(() => {
      setConfettiBurst(true);
      confettiTimerRef.current = null;
    }, 30);

    return () => {
      if (confettiTimerRef.current !== null) {
        window.clearTimeout(confettiTimerRef.current);
        confettiTimerRef.current = null;
      }
    };
  }, [published]);

  useEffect(() => {
    return () => {
      if (toastExitTimerRef.current !== null) {
        window.clearTimeout(toastExitTimerRef.current);
      }
      if (toastClearTimerRef.current !== null) {
        window.clearTimeout(toastClearTimerRef.current);
      }
      if (wobbleTimerRef.current !== null) {
        window.clearTimeout(wobbleTimerRef.current);
      }
      if (confettiTimerRef.current !== null) {
        window.clearTimeout(confettiTimerRef.current);
      }
    };
  }, []);

  if (!draft) {
    return (
      <>
        <h2>Review</h2>
        <p className="hint">Loading your live draft snapshot.</p>
      </>
    );
  }

  const clientMissingKeys = computePublishGateMissing(draft, legalAgree);
  const effectiveMissingKeys = dedupeMissingKeys([...clientMissingKeys, ...serverGateKeys]);
  const effectiveMissingSet = new Set<PublishGateKey>(effectiveMissingKeys);
  const boosts = resolveStrengthBoosts(draft);
  const previewCardProps = resolvePreviewCardProps(draft);
  const coverImageUrl = previewCardProps.coverImageUrl;
  const isClientGated = clientMissingKeys.length > 0;
  const isPublishBlocked = isClientGated || serverGateKeys.length > 0 || isPublishing || isDuplicating;

  const showToast = (message: string) => {
    if (toastExitTimerRef.current !== null) {
      window.clearTimeout(toastExitTimerRef.current);
      toastExitTimerRef.current = null;
    }
    if (toastClearTimerRef.current !== null) {
      window.clearTimeout(toastClearTimerRef.current);
      toastClearTimerRef.current = null;
    }

    setToastMessage(message);
    setToastOut(false);

    toastExitTimerRef.current = window.setTimeout(() => {
      setToastOut(true);
      toastExitTimerRef.current = null;
    }, 1400);

    toastClearTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      setToastOut(false);
      toastClearTimerRef.current = null;
    }, 1750);
  };

  const triggerChecklistAttention = () => {
    const node = checklistRef.current;
    if (!node) {
      return;
    }

    node.classList.remove("wobble");
    void node.offsetWidth;
    node.classList.add("wobble");

    if (wobbleTimerRef.current !== null) {
      window.clearTimeout(wobbleTimerRef.current);
    }

    wobbleTimerRef.current = window.setTimeout(() => {
      node.classList.remove("wobble");
      wobbleTimerRef.current = null;
    }, 480);

    scrollToChecklist(node);
  };

  const jumpToStep = (step: ReviewWizardStep) => {
    if (step === "review") {
      scrollToChecklist(checklistRef.current);
      agreeRef.current?.focus();
    }

    onEditStep?.(step);
  };

  const handleGatedPublishClick = () => {
    if ((serverGateKeys.length === 0 && !isClientGated) || isPublishing || isDuplicating) {
      return;
    }

    triggerChecklistAttention();
    showToast("Almost - tick off the red items first");
  };

  const handlePublish = async () => {
    if (isPublishBlocked) {
      return;
    }

    setIsPublishing(true);
    setPublishError(null);
    setServerGateKeys([]);

    try {
      await useSellDraftStore.getState().flush();

      const postFlushState = useSellDraftStore.getState();
      const latestDraft = postFlushState.draft;
      if (!latestDraft) {
        setPublishError("Your draft disappeared before publish.");
        return;
      }

      if (postFlushState.status === "error") {
        setPublishError(
          postFlushState.lastError ??
            "Your last edit couldn't be saved. Please check your fields before publishing.",
        );
        triggerChecklistAttention();
        return;
      }

      const api = createBrowserApiClient();
      const result = await api.POST("/api/v1/seller/drafts/{id}/publish", {
        params: { path: { id: latestDraft.id } },
        body: {
          version: latestDraft.version,
          legalAgree,
        },
      });

      if (result.data) {
        removeStoredSellDraftSnapshot(latestDraft.id);

        const createdAtMs = new Date(latestDraft.createdAt).getTime();
        const sessionStart =
          wizardMeta.startedAt > 0 && wizardMeta.startedAt <= Date.now()
            ? wizardMeta.startedAt
            : createdAtMs;
        const timeToListMs = resolveElapsedMs(sessionStart);
        const aiUsed = trackAiDraftOutcome(latestDraft);
        const publishResult = result.data as PublishResponse;

        track({
          event: "wizard.published",
          props: {
            channel: ANALYTICS_CHANNEL,
            listing_id: publishResult.listingId,
            strength: publishResult.strength.score,
            time_to_list_ms: timeToListMs,
            photo_count: resolveReadyImages(latestDraft).length,
            ai_used: aiUsed,
          },
        });

        setPublished({
          result: publishResult,
          elapsedLabel: formatElapsedLabelFromElapsedMs(timeToListMs),
        });
        return;
      }

      if (result.response.status === 422) {
        const keys = serverMissingKeys(result.error);
        setServerGateKeys(keys);
        setPublishError(
          keys.length > 0
            ? `Server still needs: ${serverMissingLabels(keys).join(", ")}`
            : "Server says this draft is not ready yet.",
        );
        triggerChecklistAttention();
        return;
      }

      setPublishError("Publish failed. Please try again.");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDuplicate = async () => {
    if (!published || isDuplicating) {
      return;
    }

    setIsDuplicating(true);
    setPublishError(null);

    try {
      const api = createBrowserApiClient();
      const result = await api.POST("/api/v1/seller/drafts/{id}/duplicate", {
        params: { path: { id: published.result.itemId } },
      });

      if (result.data) {
        navigateTo(`/sell?draft=${(result.data as DuplicateResponse).id}`);
        return;
      }

      setPublishError("Could not create the next draft yet.");
    } finally {
      setIsDuplicating(false);
    }
  };

  if (published) {
    return (
      <section
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: 22,
          border: "1px solid rgba(0, 0, 0, 0.08)",
          background:
            "linear-gradient(180deg, rgba(21, 194, 80, 0.08), rgba(255, 255, 255, 0.95) 36%)",
          padding: "24px 22px",
        }}
      >
        {!prefersReducedMotion() ? (
          <div
            aria-hidden="true"
            style={{
              pointerEvents: "none",
              position: "absolute",
              inset: 0,
              overflow: "hidden",
            }}
          >
            {CONFETTI_PIECES.map((piece) => {
              const style: CSSProperties = {
                position: "absolute",
                left: "50%",
                top: "18%",
                width: piece.width,
                height: piece.height,
                borderRadius: piece.radius,
                background: piece.color,
                boxShadow:
                  piece.color === "#f5f5f7" ? "0 0 0 1px rgba(0, 0, 0, 0.04)" : "none",
                opacity: confettiBurst ? 0 : 1,
                transform: confettiBurst
                  ? `translate(${piece.left + piece.drift}px, ${piece.drop}px) rotate(${piece.rotate}deg)`
                  : `translate(${piece.left}px, 0px) rotate(0deg)`,
                transition: `transform 920ms cubic-bezier(0.18, 0.89, 0.32, 1.18) ${piece.delay}ms, opacity 920ms ease ${piece.delay}ms`,
              };

              return <span key={piece.id} style={style} />;
            })}
          </div>
        ) : null}

        <div style={{ position: "relative", zIndex: 1 }}>
          <p className="eyebrow">Live now</p>
          <h2 style={{ fontSize: "clamp(28px, 3vw, 36px)", marginBottom: 8 }}>
            Your listing is live
          </h2>
          <p className="hint" style={{ marginBottom: 18 }}>
            Listed in <b>{published.elapsedLabel}</b>. Strength locked at{" "}
            <b>{published.result.strength.score}</b> ({formatBandLabel(published.result.strength.band)}).
          </p>

          <div className="postest" role="status" aria-live="polite">
            <b>{published.result.strength.score}/100</b>
            <span>{formatBandLabel(published.result.strength.band)}</span>
          </div>

          {publishError ? (
            <div
              className="postest"
              role="alert"
              style={{
                marginTop: 14,
                borderColor: "color-mix(in srgb, var(--sell-red) 25%, transparent)",
                background: "color-mix(in srgb, var(--sell-red) 8%, white)",
                color: "var(--sell-red-2)",
              }}
            >
              <b>Heads up</b>
              <span>{publishError}</span>
            </div>
          ) : null}

          <div className="wnav" style={{ marginTop: 22 }}>
            <button
              type="button"
              className="btn ghost lg rect"
              onClick={() => {
                void handleDuplicate();
              }}
              disabled={isDuplicating}
            >
              {isDuplicating ? "Creating..." : "List another"}
            </button>
            <div className="spacer" />
            <button
              type="button"
              className="btn green lg"
              onClick={() => navigateTo("/dashboard/listings")}
              disabled={isDuplicating}
            >
              Done
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <h2>Review</h2>
      <p className="hint">Final check before this draft becomes a live listing.</p>

      <div className="rtabs" role="tablist" aria-label="Review views">
        <button
          type="button"
          className={["rtab", activeTab === "summary" ? "on" : ""].filter(Boolean).join(" ")}
          role="tab"
          aria-selected={activeTab === "summary"}
          onClick={() => setActiveTab("summary")}
        >
          Summary
        </button>
        <button
          type="button"
          className={["rtab", activeTab === "preview" ? "on" : ""].filter(Boolean).join(" ")}
          role="tab"
          aria-selected={activeTab === "preview"}
          onClick={() => setActiveTab("preview")}
        >
          Preview as buyer
        </button>
      </div>

      {activeTab === "summary" ? (
        <div className="review">
          <div className="rphoto" aria-hidden="true">
            {coverImageUrl ? (
              <img src={coverImageUrl} alt="" />
            ) : (
              <div
                style={{
                  height: "100%",
                  display: "grid",
                  placeItems: "center",
                  textAlign: "center",
                  color: "var(--sell-ink-3)",
                  fontSize: 13,
                  padding: 12,
                }}
              >
                No ready cover image yet
              </div>
            )}
          </div>

          <div className="rlist">
            {SUMMARY_ROWS.map((row) => {
              const missingKeys = SUMMARY_MISSING_KEYS[row.key] ?? [];
              const isMissing = missingKeys.some((key) => effectiveMissingSet.has(key));
              const value = resolveSummaryValue(draft, row.key);

              return (
                <div
                  key={row.key}
                  className={["ritem", isMissing ? "miss" : ""].filter(Boolean).join(" ")}
                >
                  <span className="k">{row.label}</span>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "flex-end",
                      gap: 12,
                      maxWidth: "28rem",
                    }}
                  >
                    <span
                      className="v"
                      style={{
                        overflowWrap: "anywhere",
                      }}
                    >
                      {value}
                    </span>
                    <button
                      type="button"
                      className="edit"
                      onClick={() => jumpToStep(row.step)}
                      style={{ background: "none", border: 0, padding: 0 }}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="preview-buyer">
          <p className="pvnote">This is the live card buyers will see first.</p>
          <ListingPreviewCard {...previewCardProps} />
        </div>
      )}

      {publishError ? (
        <div
          className="postest"
          role="alert"
          style={{
            marginTop: 18,
            borderColor: "color-mix(in srgb, var(--sell-red) 25%, transparent)",
            background: "color-mix(in srgb, var(--sell-red) 8%, white)",
            color: "var(--sell-red-2)",
          }}
        >
          <b>Server gate</b>
          <span>{publishError}</span>
        </div>
      ) : null}

      <div
        ref={checklistRef}
        className="checklist"
        data-testid="review-checklist"
      >
        <h4>Publish checklist</h4>

        <div className="sub">Required</div>
        {REQUIRED_CHECKLIST_ITEMS.map((item) => {
          const isComplete = !effectiveMissingSet.has(item.key);

          return (
            <div
              key={item.key}
              className={["ck", isComplete ? "ok" : "no"].filter(Boolean).join(" ")}
            >
              <span className="cbox" aria-hidden="true">
                {isComplete ? "✓" : "!"}
              </span>
              <span className="cl">{item.label}</span>
              <button
                type="button"
                className="jump"
                onClick={() => jumpToStep(item.step)}
                style={{ background: "none", border: 0, padding: 0 }}
              >
                Jump
              </button>
            </div>
          );
        })}

        <div className="sub">Boosts</div>
        {boosts.length > 0 ? (
          boosts.map((item) => (
            <div key={item.key} className="ck rec no">
              <span className="cbox" aria-hidden="true">
                +
              </span>
              <span className="cl">{item.label}</span>
              <button
                type="button"
                className="jump"
                onClick={() => jumpToStep(BOOST_STEP_BY_INDEX[item.step] ?? "details")}
                style={{ background: "none", border: 0, padding: 0 }}
              >
                Jump
              </button>
            </div>
          ))
        ) : (
          <div className="ck ok">
            <span className="cbox" aria-hidden="true">
              ✓
            </span>
            <span className="cl">No extra score boosters left on this draft.</span>
          </div>
        )}
      </div>

      <label className="agree" htmlFor={agreeId}>
        <input
          ref={agreeRef}
          id={agreeId}
          type="checkbox"
          checked={legalAgree}
          onChange={(event) => setLegalAgree(event.target.checked)}
        />
        <span>
          I agree to{" "}
          <a href="/terms" target="_blank" rel="noreferrer">
            Bushpop&apos;s terms
          </a>
          .
        </span>
      </label>

      <div
        className="wnav"
        data-testid="publish-wrap"
        onClick={handleGatedPublishClick}
      >
        <div className="spacer" />
        <button
          type="button"
          className="btn green lg"
          onClick={() => {
            void handlePublish();
          }}
          disabled={isPublishBlocked}
        >
          {isPublishing ? "Publishing..." : "Publish"}
        </button>
      </div>

      {toastMessage ? (
        <div className="toasts" aria-live="polite">
          <div className={["toast", toastOut ? "out" : ""].filter(Boolean).join(" ")} role="status">
            {toastMessage}
          </div>
        </div>
      ) : null}
    </>
  );
}
